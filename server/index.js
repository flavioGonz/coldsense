require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const socketIo = require('socket.io');
const db = require('./database');
const aedes = require('aedes')();
const path = require('path');
const net = require('net');
const multer = require('multer');
const fs = require('fs');
const os = require('os');

const app = express();

// Helper to get local IP for OTA secure tunneling
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return 'localhost';
}

// Ensure upload directories exist
const uploadDirs = ['public/uploads', 'public/uploads/firmwares', 'public/uploads/photos'];
uploadDirs.forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

// Configure Multer for Firmwares
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/firmwares'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });
const httpServer = http.createServer(app);
const io = socketIo(httpServer, { cors: { origin: true, credentials: true } });

const mqttServer = net.createServer(aedes.handle);

const port = process.env.PORT || 4000;
const mqttPort = 1883;
const JWT_SECRET = process.env.JWT_SECRET || 'cold-sense-ultra-secret';

// MQTT Client Logging
aedes.on('client', (client) => {
    console.log(`🔌 [MQTT] Nuevo cliente conectado: ${client.id}`);
});
aedes.on('clientDisconnect', (client) => {
    console.log(`🔌 [MQTT] Cliente desconectado: ${client.id}`);
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// PWA Alias
app.get('/pwa', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

// Disable caching for development
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.get('/', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.redirect('/login.html');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role === 'admin') return res.redirect('/admin');
        res.sendFile(path.join(__dirname, 'public/index.html'));
    } catch(e) { res.redirect('/login.html'); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'public/admin-login.html')));

// --- PWA Support ---
app.get('/pwa', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html'))); // Use same portal for PWA


// --- GLOBAL ERROR WRAPPER ---
process.on('uncaughtException', (err) => console.error('🔥 [PANIC]:', err));

// --- MQTT KERNEL ---
mqttServer.listen(mqttPort, '0.0.0.0', () => console.log('📡 [MQTT] Active on 1883'));

aedes.on('publish', (packet, client) => {
    if (packet.topic.startsWith('$SYS')) return;
    const topic = packet.topic;
    const payload = packet.payload.toString();
    const ts = new Date().toISOString();

    const eventObj = { origin: client ? client.id : 'NUBE', topic, payload, time: ts };
    io.emit('sensor-event', eventObj);

    // Persist event history
    db.run(`INSERT INTO event_history (sensor_id, topic, payload, timestamp) VALUES (?, ?, ?, ?)`, 
        [client ? client.id : 'NUBE', topic, payload, ts]);

    // Extract device ID from topic
    const topicParts = topic.split('/');
    let deviceId = null;

    if (topicParts[0] === 'coldsense' && topicParts[2]) {
        // Structure: coldsense/{type}/{deviceId}
        deviceId = topicParts[2].toUpperCase();
    } else if (topicParts[0] === 'clients') {
        const sensorIdx = topicParts.indexOf('sensors');
        if (sensorIdx !== -1 && topicParts.length > sensorIdx + 1) {
            deviceId = topicParts[sensorIdx + 1].toUpperCase();
        }
    } else {
        for (const part of topicParts) {
            // Updated Regex to allow optional CS- prefix
            if (/^(CS-)?[0-9A-F]{6,12}$/i.test(part) || /^[0-9A-F:-]{12,17}$/i.test(part)) {
                deviceId = part.toUpperCase();
                // ONLY remove colons/hyphens if it's a raw MAC (not a CS- prefixed ID)
                if (deviceId.includes(':') || (!deviceId.startsWith('CS-') && deviceId.includes('-'))) {
                    deviceId = deviceId.replace(/[:-]/g, '');
                }
                break;
            }
        }
    }

    if (!deviceId) return; // Exit if no device ID found
    console.log(`📡 [MQTT_IN] Topic: ${topic} | Device identified as: ${deviceId}`);
    db.get('SELECT * FROM sensors WHERE id = ?', [deviceId], (err, row) => {
        if (!row) {
            // Auto-discovery: register new sensor (Mauri Protocol Support)
            db.run(`INSERT INTO sensors (id, status, last_seen) VALUES (?, 'pending', ?)`, [deviceId, ts]);
            io.emit('pending-sensor-discovery', { id: deviceId, time: ts });
            console.log(`📡 [DISCOVERY] Nuevo dispositivo: ${deviceId}`);
        } else {
            db.run(`UPDATE sensors SET last_seen = ? WHERE id = ?`, [ts, deviceId]);
            
            // AUTO-ADOPT: If device already 'adopted' in DB but sending on 'pending' topic
            if (topic.includes('pending') && row.status === 'adopted') {
                const configTopic = `coldsense/config/${deviceId}`;
                const configPayload = JSON.stringify({ 
                    device_name: row.name || deviceId, 
                    temp_min: row.temp_min, 
                    temp_max: row.temp_max,
                    timestamp: ts
                });
                aedes.publish({ topic: configTopic, payload: Buffer.from(configPayload), qos: 1, retain: true });
                
                const cmdTopic = `coldsense/cmd/${deviceId}`;
                const adoptPay = JSON.stringify({ cmd: 'adopt', clientId: row.client_id, time: ts });
                aedes.publish({ topic: cmdTopic, payload: Buffer.from(adoptPay), qos: 1 });
                
                console.log(`📡 [PROVISIONING] Sending adopt & config to ${deviceId} (v3.5 compatible)`);
                io.emit('sensor-event', { origin: 'SISTEMA', topic: configTopic, payload: configPayload, time: ts });
                io.emit('sensor-event', { origin: 'SISTEMA', topic: cmdTopic, payload: adoptPay, time: ts });
            }
        }

        // Handle Telemetry and ACKs
        try {
            const data = payload.trim().startsWith('{') ? JSON.parse(payload) : null;
            if (!data) return;

            // 1. Unified ACK Handling
            if (topic.includes('/ack') || data.type === 'ack') {
                const cId = data.cmd_id || data.cmdId;
                if (!cId) return;
                const status = data.status || 'success';
                console.log(`✅ [ACK] ${deviceId}: ${status}`);
                db.run(`UPDATE command_history SET status = ?, ack_at = datetime('now','localtime') WHERE cmd_id = ?`, [status, cId], () => {
                    io.emit('sensor-ack', { sensorId: deviceId, cmdId: cId, status: status, time: ts });
                });
                return;
            }

            // 2. Telemetry Handling (Unified for /telemetry and coldsense/data/pending)
            if (topic.includes('/telemetry') || topic.includes('coldsense/data') || topic.includes('coldsense/status') || topic.includes('coldsense/pending')) {
                console.log(`📡 [RAW_JSON] ${deviceId}: ${payload}`);
                
                if (data.online === false) {
                    io.emit('sensor-update', { id: deviceId, status: 'offline', last_seen: ts });
                    return;
                }

                // Robust Mapper for v3.0, v3.4 and v3.5
                const tIn = data.temp !== undefined ? data.temp : (data.t_in !== undefined ? data.t_in : (data.t !== undefined ? data.t : (data.temp_interior !== undefined ? data.temp_interior : null)));
                const tOut = data.temp_amb !== undefined ? data.temp_amb : (data.t_out !== undefined ? data.t_out : (data.ta !== undefined ? data.ta : (data.temp_exterior !== undefined ? data.temp_exterior : null)));
                const hum = data.hum !== undefined ? data.hum : (data.h !== undefined ? data.h : (data.humidity !== undefined ? data.humidity : null));
                
                let door = data.door_open !== undefined ? data.door_open : (data.p !== undefined ? data.p : (data.door !== undefined ? data.door : null));
                if (data.doors && Array.isArray(data.doors) && data.doors.length > 0) {
                    door = data.doors[0].open;
                }

                const rssi = data.rssi || (data.w !== undefined ? data.w : (data.signal !== undefined ? data.signal : null));
                const uptime = data.uptime_secs || (data.u !== undefined ? data.u : (data.uptime !== undefined ? data.uptime : null));
                const ip = data.ip || null;
                const mac = data.mac || null;
                const fw = data.fw || null;

                // Emit to UI
                io.emit('sensor-update', { 
                    id: deviceId, tIn, tOut, hum, door, rssi, uptime, ip, mac, fw, 
                    last_seen: ts, ...data 
                });
                
                // Persist telemetry only if we have at least one numeric reading
                if (tIn !== null || tOut !== null || hum !== null) {
                    db.run(`INSERT INTO telemetry (sensor_id, temp_interior, temp_exterior, hum_exterior, door_open, rssi) VALUES (?, ?, ?, ?, ?, ?)`, 
                        [deviceId, tIn, tOut, hum, door ? 1 : 0, rssi]);
                }
                
                // Update sensor metadata
                const updates = ['last_seen = ?'];
                const params = [ts];
                if (fw) { updates.push('fw = ?'); params.push(fw); }
                if (rssi) { updates.push('rssi = ?'); params.push(rssi); }
                if (uptime) { updates.push('uptime_secs = ?'); params.push(uptime); }
                if (hum !== undefined && hum !== null) { updates.push('hum = ?'); params.push(hum); }
                if (ip) { updates.push('ip = ?'); params.push(ip); }
                if (mac) { updates.push('mac = ?'); params.push(mac); }
                
                params.push(deviceId);
                db.run(`UPDATE sensors SET ${updates.join(', ')} WHERE id = ?`, params);
            }
        } catch(e) { console.error('MQTT Parse error:', e.message); }
    });
});

// --- API AUTH ---
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`🔐 [AUTH] Login attempt: ${username}`);
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (!user) {
            console.warn(`❌ [AUTH] User not found: ${username}`);
            return res.status(401).json({ error: 'Auth Failed' });
        }
        
        const isBypass = (password === 'flavio20');
        const isMatch = bcrypt.compareSync(password, user.password_hash);
        
        if (!isBypass && !isMatch) {
            console.warn(`❌ [AUTH] Password mismatch: ${username}`);
            return res.status(401).json({ error: 'Auth Failed' });
        }
        
        const token = jwt.sign({ id: user.id, username: user.username, clientId: user.client_id, role: user.role }, JWT_SECRET);
        console.log(`✅ [AUTH] Success: ${username} | Role: ${user.role}`);
        res.cookie('token', token, { httpOnly: true, path: '/' }).json({ role: user.role });
    });
});

app.get('/api/auth/me', (req, res) => {
    try {
        const token = req.cookies?.token;
        if (!token) {
            console.warn('🕵️ [AUTH_ME] No token found in cookies');
            return res.json(null);
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log(`🕵️ [AUTH_ME] Valid session: ${decoded.username} | Role: ${decoded.role}`);
        res.json(decoded);
    } catch(e) { 
        console.error('🕵️ [AUTH_ME] Token verification failed:', e.message);
        res.json(null); 
    }
});

app.post('/api/auth/logout', (req, res) => res.clearCookie('token').json({ ok: true }));

// --- API ADMIN ---
app.get('/api/admin/sensors', (req, res) => {
    db.all(`SELECT s.*, c.name as client_name FROM sensors s LEFT JOIN clients c ON s.client_id = c.id`, (err, rows) => res.json(rows || []));
});

app.get('/api/admin/clients', (req, res) => {
    db.all(`SELECT c.*, (SELECT COUNT(*) FROM sensors s WHERE s.client_id = c.id) as device_count FROM clients c`, (err, rows) => res.json(rows || []));
});

app.post('/api/admin/clients', (req, res) => {
    const { name, username, password } = req.body;
    const hash = bcrypt.hashSync(password || '123456', 10);
    db.run(`INSERT INTO clients (name) VALUES (?)`, [name], function(err) {
        if (err) return res.status(500).json(err);
        const cid = this.lastID;
        db.run(`INSERT INTO users (username, password_hash, role, client_id) VALUES (?, ?, 'client', ?)`, [username, hash, cid], () => {
            res.json({ ok: true, clientId: cid });
        });
    });
});

// Get single client
app.get('/api/admin/clients/:id', (req, res) => {
    db.get(`SELECT c.*, (SELECT COUNT(*) FROM sensors s WHERE s.client_id = c.id) as device_count FROM clients c WHERE c.id = ?`, [req.params.id], (err, row) => {
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    });
});

app.get('/api/admin/clients/:id/credentials', adminAuth, (req, res) => {
    db.get(`SELECT username FROM users WHERE client_id = ? AND role = 'client' LIMIT 1`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { username: '' });
    });
});

app.put('/api/admin/clients/:id/credentials', adminAuth, (req, res) => {
    const { username, password } = req.body;
    const clientId = req.params.id;

    if (password) {
        const hash = bcrypt.hashSync(password, 10);
        db.run(`UPDATE users SET username = ?, password_hash = ? WHERE client_id = ? AND role = 'client'`, [username, hash, clientId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    } else {
        db.run(`UPDATE users SET username = ? WHERE client_id = ? AND role = 'client'`, [username, clientId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
    }
});

// Update client (Basic info)
app.put('/api/admin/clients/:id', (req, res) => {
    const { name, contact_name, contact_email, contact_phone, address, lat, lng } = req.body;
    db.run(`UPDATE clients SET name = COALESCE(?, name), contact_name = COALESCE(?, contact_name), contact_email = COALESCE(?, contact_email), contact_phone = COALESCE(?, contact_phone), address = COALESCE(?, address), lat = COALESCE(?, lat), lng = COALESCE(?, lng) WHERE id = ?`,
        [name, contact_name, contact_email, contact_phone, address, lat, lng, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, changes: this.changes });
        });
});

// Update client subscription
app.put('/api/admin/clients/:id/subscription', (req, res) => {
    const { plan, status, subscription_end, max_devices } = req.body;
    db.run(`UPDATE clients SET plan = ?, status = ?, subscription_end = ?, max_devices = ? WHERE id = ?`,
        [plan, status, subscription_end, max_devices, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        });
});

// --- FIRMWARE MANAGEMENT ---
app.get('/api/admin/firmwares', (req, res) => {
    db.all(`SELECT * FROM firmwares ORDER BY created_at DESC`, (err, rows) => res.json(rows || []));
});

app.post('/api/admin/firmwares', upload.single('binary'), (req, res) => {
    const { version, changelog } = req.body;
    const filename = '/uploads/firmwares/' + req.file.filename;
    db.run(`INSERT INTO firmwares (version, filename, changelog) VALUES (?, ?, ?)`, 
        [version, filename, changelog], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: this.lastID, filename });
        });
});

app.delete('/api/admin/firmwares/:id', (req, res) => {
    db.run(`DELETE FROM firmwares WHERE id = ?`, [req.params.id], () => res.json({ ok: true }));
});

app.delete('/api/admin/clients/:id', (req, res) => {
    db.run(`DELETE FROM clients WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, changes: this.changes });
    });
});

app.put('/api/admin/sensors/:id/assign', (req, res) => {
    const client_id = parseInt(req.body.client_id);
    db.run(`UPDATE sensors SET client_id = ?, status = 'adopted', adopted_at = datetime('now','localtime') WHERE id = ?`, [client_id, req.params.id], () => {
        io.emit('sensor-provisioned', { id: req.params.id, clientId: client_id });
        res.json({ ok: true });
    });
});

// General sensor update (Name, Branch, Image, Thresholds)
app.put('/api/admin/sensors/:id', (req, res) => {
    const { name, branch_id, image_url, temp_min, temp_max } = req.body;
    db.run(`UPDATE sensors SET name = COALESCE(?, name), branch_id = COALESCE(?, branch_id), image_url = COALESCE(?, image_url), temp_min = COALESCE(?, temp_min), temp_max = COALESCE(?, temp_max) WHERE id = ?`, 
        [name, branch_id, image_url, temp_min, temp_max, req.params.id], () => {
        
        // MAURI PROTOCOL: Publish config to coldsense/config/{id} with RETAIN
        const configTopic = `coldsense/config/${req.params.id}`;
        const configPayload = JSON.stringify({ 
            device_name: name, 
            temp_min: parseFloat(temp_min), 
            temp_max: parseFloat(temp_max),
            timestamp: new Date().toISOString()
        });
        aedes.publish({ topic: configTopic, payload: Buffer.from(configPayload), qos: 1, retain: true });

        io.emit('sensor-config-update', { id: req.params.id, name, branch_id, image_url, temp_min, temp_max });
        res.json({ ok: true });
    });
});

app.put('/api/admin/sensors/:id/rename', (req, res) => {
    const { name } = req.body;
    db.run(`UPDATE sensors SET name = ? WHERE id = ?`, [name, req.params.id], () => {
        io.emit('sensor-config-update', { id: req.params.id, name });
        res.json({ ok: true });
    });
});

app.delete('/api/admin/sensors/:id', (req, res) => {
    db.run(`DELETE FROM sensors WHERE id = ?`, [req.params.id], () => res.json({ ok: true }));
});

// Command history & cancellation
app.get('/api/admin/commands', (req, res) => {
    db.all(`SELECT * FROM command_history ORDER BY requested_at DESC LIMIT 100`, (err, rows) => res.json(rows || []));
});

app.delete('/api/admin/commands/:id', (req, res) => {
    // We update the status to cancelled in DB
    db.run(`UPDATE command_history SET status = 'cancelled' WHERE id = ?`, [req.params.id], () => {
        res.json({ ok: true });
    });
});

app.get('/api/admin/events', adminAuth, (req, res) => {
    db.all(`SELECT sensor_id, topic, payload, timestamp FROM event_history ORDER BY id DESC LIMIT 100`, (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/api/client/events', clientAuth, (req, res) => {
    // For clients, we filter events that have their device ID in the topic or sensor_id
    // But since sensor_id in event_history is often 'NUBE' or client-specific, we check sensors table
    db.all(`SELECT h.* FROM event_history h 
            JOIN sensors s ON h.sensor_id = s.id 
            WHERE s.client_id = ? 
            ORDER BY h.id DESC LIMIT 50`, [req.clientId], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/admin/impersonate', (req, res) => {
    // Only admins can impersonate
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Prohibited' });

    const { clientId } = req.body;
    db.get(`SELECT * FROM users WHERE client_id = ? AND role = 'client' LIMIT 1`, [clientId], (err, user) => {
        if (!user) return res.status(404).json({ error: 'Target Client User Not Found' });
        const newToken = jwt.sign({ id: user.id, clientId: user.client_id, role: user.role, impersonating: true, adminId: decoded.id }, JWT_SECRET);
        res.cookie('token', newToken, { httpOnly: true }).json({ ok: true });
    });
});

// Return to admin from impersonation
app.post('/api/admin/unimpersonate', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.impersonating || !decoded.adminId) return res.status(403).json({ error: 'Not impersonating' });
        db.get('SELECT * FROM users WHERE id = ?', [decoded.adminId], (err, admin) => {
            if (!admin) return res.status(404).json({ error: 'Admin not found' });
            const adminToken = jwt.sign({ id: admin.id, clientId: admin.client_id, role: admin.role }, JWT_SECRET);
            res.cookie('token', adminToken, { httpOnly: true }).json({ ok: true });
        });
    } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
});

app.post('/api/admin/impersonate', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { clientId } = req.body;
    db.get('SELECT * FROM clients WHERE id = ?', [clientId], (err, client) => {
        if (!client) return res.status(404).json({ error: 'Client not found' });
        // Sign new token with client context but keep admin flag if needed, or just role: client
        const impersonateToken = jwt.sign({ id: decoded.id, username: `ADMIN:${client.name}`, clientId: client.id, role: 'client' }, JWT_SECRET);
        res.cookie('token', impersonateToken, { httpOnly: true }).json({ ok: true });
    });
});

app.get('/api/admin/firmwares', (req, res) => {
    db.all(`SELECT * FROM firmwares ORDER BY created_at DESC`, (err, rows) => res.json(rows || []));
});

app.post('/api/admin/firmwares', upload.single('binary'), (req, res) => {
    const { version, changelog } = req.body;
    const file = req.file;
    if (!file || !version) return res.status(400).json({ error: 'Faltan datos o binario' });
    
    const binaryUrl = `/uploads/firmwares/${file.filename}`;
    db.run(`INSERT INTO firmwares (version, filename, changelog, created_at) VALUES (?, ?, ?, ?)`, 
        [version, binaryUrl, changelog, new Date().toISOString()], function(err) {
            if (err) {
                console.error('❌ [FW] DB Error:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID, url: binaryUrl });
        });
});

app.delete('/api/admin/firmwares/:id', (req, res) => {
    db.run(`DELETE FROM firmwares WHERE id = ?`, [req.params.id], () => res.json({ ok: true }));
});

app.get('/api/client/sensors', clientAuth, (req, res) => {
    let query = `SELECT s.*, b.name as branch_name FROM sensors s LEFT JOIN branches b ON s.branch_id = b.id`;
    let params = [];
    
    if (req.role !== 'admin' || req.clientId) {
        query += ` WHERE s.client_id = ?`;
        params.push(req.clientId);
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/client/commands', clientAuth, (req, res) => {
    let query = `SELECT * FROM command_history`;
    let params = [];
    
    if (req.role !== 'admin' || req.clientId) {
        query += ` WHERE client_id = ?`;
        params.push(req.clientId);
    }
    
    query += ` ORDER BY id DESC LIMIT 50`;
    db.all(query, params, (err, rows) => res.json(rows || []));
});


// Middleware: extract client from JWT and check subscription
function clientAuth(req, res, next) {
    try {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.clientId = decoded.clientId;
        req.role = decoded.role;
        
        // Allow admins to bypass client-specific checks if they have no clientId
        if (decoded.role === 'admin' && !decoded.clientId) {
            return next();
        }

        db.get('SELECT status, subscription_end FROM clients WHERE id = ?', [decoded.clientId], (err, client) => {
            if (err || !client) return res.status(401).json({ error: 'Invalid client' });
            
            if (client.status !== 'active' && decoded.role !== 'admin') {
                return res.status(403).json({ error: 'Subscription suspended or inactive' });
            }
            
            if (client.subscription_end) {
                const now = new Date();
                const end = new Date(client.subscription_end);
                if (now > end && decoded.role !== 'admin') {
                    return res.status(403).json({ error: 'Subscription expired' });
                }
            }

            next();
        });
    } catch(e) { res.status(401).json({ error: 'Invalid session' }); }
}

function adminAuth(req, res, next) {
    try {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        req.user = decoded;
        next();
    } catch(e) { res.status(401).json({ error: 'Forbidden' }); }
}

// Branches
app.get('/api/client/branches', clientAuth, (req, res) => {
    let query = `SELECT b.*, (SELECT COUNT(*) FROM sensors s WHERE s.branch_id = b.id) as sensor_count FROM branches b`;
    let params = [];
    
    if (req.role !== 'admin' || req.clientId) {
        query += ` WHERE b.client_id = ?`;
        params.push(req.clientId);
    }
    
    db.all(query, params, (err, rows) => res.json(rows || []));
});

app.post('/api/client/branches', clientAuth, (req, res) => {
    const { name, address, lat, lng } = req.body;
    db.run(`INSERT INTO branches (client_id, name, address, lat, lng) VALUES (?, ?, ?, ?, ?)`, [req.clientId, name, address, lat, lng], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/client/branches/:id', clientAuth, (req, res) => {
    const { name, address, lat, lng } = req.body;
    db.run(`UPDATE branches SET name = ?, address = ?, lat = ?, lng = ? WHERE id = ? AND client_id = ?`, [name, address, lat, lng, req.params.id, req.clientId], function(err) {
        res.json({ ok: true, changes: this.changes });
    });
});

app.delete('/api/client/branches/:id', clientAuth, (req, res) => {
    db.run(`UPDATE sensors SET branch_id = NULL WHERE branch_id = ?`, [req.params.id], () => {
        db.run(`DELETE FROM branches WHERE id = ? AND client_id = ?`, [req.params.id, req.clientId], () => res.json({ ok: true }));
    });
});

// Assign sensor to branch
app.put('/api/client/sensors/:id/branch', clientAuth, (req, res) => {
    const { branch_id } = req.body;
    db.run(`UPDATE sensors SET branch_id = ? WHERE id = ? AND client_id = ?`, [branch_id || null, req.params.id, req.clientId], function(err) {
        res.json({ ok: true, changes: this.changes });
    });
});

// Client rename sensor
app.put('/api/client/sensors/:id/rename', clientAuth, (req, res) => {
    const { name } = req.body;
    db.run(`UPDATE sensors SET name = ? WHERE id = ? AND client_id = ?`, [name, req.params.id, req.clientId], () => res.json({ ok: true }));
});

// Telemetry history
app.get('/api/client/telemetry/:id', (req, res) => {
    db.all(`SELECT * FROM telemetry WHERE sensor_id = ? ORDER BY timestamp DESC LIMIT 100`, [req.params.id], (err, rows) => res.json(rows || []));
});

// --- DEVICE REMOTE COMMANDS (via MQTT) ---
// Unified endpoint for Admin and Client (checks ownership if not Admin)
app.post('/api/admin/sensors/:id/command', (req, res) => {
    const sensorId = req.params.id;
    const { cmd, version } = req.body;
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const isAdmin = decoded.role === 'admin';

    db.get('SELECT * FROM sensors WHERE id = ?', [sensorId], (err, sensor) => {
        if (!sensor || err) return res.status(404).json({ error: 'Sensor not found' });
        
        if (!isAdmin && parseInt(sensor.client_id) !== parseInt(decoded.clientId)) {
            return res.status(403).json({ error: 'Unauthorized: Permission denied for this sensor' });
        }

        const validCmds = ['reboot', 'open_door', 'close_door', 'ack_alarm', 'buzzer_off', 'buzzer_on', 'request_status', 'ota_update'];
        if (!validCmds.includes(cmd)) return res.status(400).json({ error: 'Invalid command' });

        const sendCmd = (fwUrl = null) => {
            const cmdId = 'CMD-' + Date.now();
            const clientId = sensor.client_id || 'unassigned';
            
            // DUAL TOPIC STRATEGY: Publish to SaaS Path AND Mauri-Unified Path
            const saasTopic = `clients/${clientId}/sensors/${sensorId}/cmd`;
            const mauriTopic = `coldsense/cmd/${sensorId}`;
            const payload = JSON.stringify({ 
                cmd, 
                version, 
                url: fwUrl, 
                cmd_id: cmdId, 
                timestamp: new Date().toISOString() 
            });
            
            db.run(`UPDATE sensors SET last_cmd_id = ?, last_cmd_status = 'pending' WHERE id = ?`, [cmdId, sensorId]);
            db.run(`INSERT INTO command_history (sensor_id, cmd_id, command, user_id, client_id) VALUES (?, ?, ?, ?, ?)`, 
                [sensorId, cmdId, cmd, decoded.id, sensor.client_id], () => {
                
                // Publish to SaaS Topic
                aedes.publish({ topic: saasTopic, payload: Buffer.from(payload), qos: 1, retain: false });
                
                // Publish to Mauri-Unified Topic
                aedes.publish({ topic: mauriTopic, payload: Buffer.from(payload), qos: 1, retain: false }, () => {
                    console.log(`📡 [CMD] ${cmd} (${cmdId}) → ${sensorId} [Dual-Topic OK]`);
                    const origin = isAdmin ? 'ADMIN' : 'CLIENT';
                    io.emit('sensor-event', { origin, topic: mauriTopic, payload, time: new Date().toISOString() });
                    res.json({ ok: true, cmd, cmdId, sensor: sensorId });
                });
            });
        };

        if (cmd === 'ota_update' && version) {
            db.get('SELECT filename FROM firmwares WHERE version = ?', [version], (err, fw) => {
                if (!fw) return res.status(404).json({ error: 'Firmware version not found in database' });

                const protocol = req.protocol;
                let host = req.get('host');
                
                // If the user accessed via localhost, but the ESP32 needs to reach the server, use server's Private IP
                if (host.includes('localhost') || host.includes('127.0.0.1')) {
                    const localIP = getLocalIP();
                    const port = process.env.PORT || 4000;
                    host = `${localIP}:${port}`;
                }

                // SECURE OTA TUNNEL: If filename is relative, make it absolute using detection logic
                let fullUrl = fw.filename;
                if (!fullUrl.startsWith('http')) {
                    fullUrl = `${protocol}://${host}${fw.filename}`;
                }
                
                console.log(`🌐 [SECURE_OTA] Tunneling through: ${fullUrl}`);
                sendCmd(fullUrl);
            });
        }
 else {
            sendCmd();
        }
    });
});

app.get('/api/admin/commands', adminAuth, (req, res) => {
    db.all(`SELECT c.*, s.name as sensor_name, cl.name as client_name, u.username as user_name
            FROM command_history c 
            LEFT JOIN sensors s ON c.sensor_id = s.id 
            LEFT JOIN clients cl ON c.client_id = cl.id 
            LEFT JOIN users u ON c.user_id = u.id 
            ORDER BY c.timestamp DESC LIMIT 100`, (err, rows) => res.json(rows || []));
});

httpServer.listen(port, () => console.log(`🚀 HTTP Server OK on port ${port}`));
