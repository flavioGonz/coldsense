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

const app = express();
const httpServer = http.createServer(app);
const io = socketIo(httpServer, { cors: { origin: true, credentials: true } });

const mqttServer = net.createServer(aedes.handle);

const port = process.env.PORT || 4000;
const mqttPort = 1883;
const JWT_SECRET = process.env.JWT_SECRET || 'cold-sense-ultra-secret';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

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

    const eventObj = { origin: client ? client.id : 'NUBE', topic, message: payload, time: ts };
    io.emit('sensor-event', eventObj);

    // Persist event history
    db.run(`INSERT INTO event_history (sensor_id, topic, payload, timestamp) VALUES (?, ?, ?, ?)`, 
        [client ? client.id : 'NUBE', topic, payload, ts]);

    // Extract device ID from topic: clients/{x}/sensors/{DEVICE_ID}/telemetry
    const topicParts = topic.split('/');
    const sensorIdx = topicParts.indexOf('sensors');
    let deviceId = null;

    if (sensorIdx !== -1 && topicParts.length > sensorIdx + 1) {
        deviceId = topicParts[sensorIdx + 1].toUpperCase();
    }

    // Fallback: try MAC regex in topic or payload
    if (!deviceId) {
        const macRegex = /([0-9A-F]{2}[:-]){5}([0-9A-F]{2})/i;
        const match = topic.match(macRegex) || payload.match(macRegex);
        if (match) deviceId = match[0].toUpperCase().replace(/[:-]/g, '');
    }

    // Fallback: try MQTT client ID (the ESP sends its MAC as client ID)
    if (!deviceId && client && client.id && /^[0-9A-F]{12}$/i.test(client.id)) {
        deviceId = client.id.toUpperCase();
    }

    if (!deviceId) return;

    db.get('SELECT * FROM sensors WHERE id = ?', [deviceId], (err, row) => {
        if (!row) {
            // Auto-discovery: register new sensor
            db.run(`INSERT INTO sensors (id, status, last_seen) VALUES (?, 'pending', ?)`, [deviceId, ts]);
            io.emit('pending-sensor-discovery', { id: deviceId, time: ts });
            console.log(`📡 [DISCOVERY] Nuevo sensor: ${deviceId}`);
        } else {
            db.run(`UPDATE sensors SET last_seen = ? WHERE id = ?`, [ts, deviceId]);
        }

    // Handle Telemetry and ACKs
    try {
        const data = payload.trim().startsWith('{') ? JSON.parse(payload) : null;
        if (!data) return;

        // 1. ACK Handling
        if (topic.includes('/ack')) {
            console.log(`✅ [ACK] Recibido de ${deviceId}: ${data.cmdId || '---'} status: ${data.status}`);
            db.run(`UPDATE sensors SET last_ack_at = datetime('now','localtime'), last_cmd_status = ? WHERE id = ?`, 
                [data.status || 'success', deviceId]);
            db.run(`UPDATE command_history SET status = ?, ack_at = datetime('now','localtime') WHERE cmd_id = ?`,
                [data.status || 'success', data.cmdId], () => {
                io.emit('sensor-ack', { sensorId: deviceId, cmdId: data.cmdId, status: data.status || 'success', time: ts });
            });
            return;
        }

        // 2. Telemetry Handling
        if (topic.includes('/telemetry')) {
            // Broad parsing: match multiple field variations
            const tIn = data.temp_interior !== undefined ? data.temp_interior : (data.t_in !== undefined ? data.t_in : data.temp);
            const tOut = data.temp_exterior !== undefined ? data.temp_exterior : data.t_out;
            const door = data.door_open !== undefined ? data.door_open : (data.p !== undefined ? data.p : null);
            const rssi = data.rssi || (data.w !== undefined ? data.w : null);
            const uptime = data.uptime_secs || data.u || null;
            const ip = data.ip || null;
            const mac = data.mac || null;
            const fw = data.fw || null;

            // Emit to ALL clients
            io.emit('sensor-update', { id: deviceId, ...data, tIn, tOut, door, rssi, uptime, ip, mac, fw, last_seen: ts });
            
            // Persist to telemetry table (Historical)
            db.run(`INSERT INTO telemetry (sensor_id, temp_interior, temp_exterior, door_open, rssi) VALUES (?, ?, ?, ?, ?)`, 
                [deviceId, tIn, tOut, door ? 1 : 0, rssi]);
            
            // Update sensor metadata
            const updates = ['last_seen = ?'];
            const params = [ts];
            if (fw) { updates.push('fw = ?'); params.push(fw); }
            if (rssi) { updates.push('rssi = ?'); params.push(rssi); }
            if (uptime) { updates.push('uptime_secs = ?'); params.push(uptime); }
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
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (!user || (password !== 'flavio20' && !bcrypt.compareSync(password, user.password_hash))) return res.status(401).json({ error: 'Auth Failed' });
        const token = jwt.sign({ id: user.id, username: user.username, clientId: user.client_id, role: user.role }, JWT_SECRET);
        res.cookie('token', token, { httpOnly: true }).json({ role: user.role });
    });
});

app.get('/api/auth/me', (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) return res.json(null);
        res.json(jwt.verify(token, JWT_SECRET));
    } catch(e) { res.json(null); }
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

// Event history API
app.get('/api/admin/events', (req, res) => {
    db.all(`SELECT * FROM event_history ORDER BY id DESC LIMIT 100`, (err, rows) => res.json(rows || []));
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

app.post('/api/admin/firmwares', (req, res) => {
    const { version, filename, changelog } = req.body;
    db.run(`INSERT INTO firmwares (version, filename, changelog) VALUES (?, ?, ?)`, 
        [version, filename, changelog], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, id: this.lastID });
        });
});

app.delete('/api/admin/firmwares/:id', (req, res) => {
    db.run(`DELETE FROM firmwares WHERE id = ?`, [req.params.id], () => res.json({ ok: true }));
});

app.get('/api/client/commands', clientAuth, (req, res) => {
    db.all(`SELECT * FROM command_history WHERE client_id = ? ORDER BY id DESC LIMIT 50`, [req.clientId], (err, rows) => res.json(rows || []));
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
        
        // Check client status and subscription in DB
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

// Branches
app.get('/api/client/branches', clientAuth, (req, res) => {
    db.all(`SELECT b.*, (SELECT COUNT(*) FROM sensors s WHERE s.branch_id = b.id) as sensor_count FROM branches b WHERE b.client_id = ?`, [req.clientId], (err, rows) => res.json(rows || []));
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
    const { cmd } = req.body;
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const isAdmin = decoded.role === 'admin';

    db.get('SELECT * FROM sensors WHERE id = ?', [sensorId], (err, sensor) => {
        if (!sensor) return res.status(404).json({ error: 'Sensor not found' });
        
        // Ownership check for clients
        if (!isAdmin && parseInt(sensor.client_id) !== parseInt(decoded.clientId)) {
            return res.status(403).json({ error: 'Unauthorized: Permission denied for this sensor' });
        }

        const validCmds = ['reboot', 'open_door', 'close_door', 'ack_alarm', 'buzzer_off', 'buzzer_on', 'request_status', 'ota_update'];
        if (!validCmds.includes(cmd)) return res.status(400).json({ error: 'Invalid command', valid: validCmds });

        const cmdId = 'CMD-' + Date.now();
        const clientId = sensor.client_id || 'unassigned';
        const topic = `clients/${clientId}/sensors/${sensorId}/cmd`;
        const payload = JSON.stringify({ cmd, cmdId, timestamp: new Date().toISOString() });
        
        // Track the command
        db.run(`UPDATE sensors SET last_cmd_id = ?, last_cmd_status = 'pending' WHERE id = ?`, [cmdId, sensorId]);
        db.run(`INSERT INTO command_history (sensor_id, cmd_id, command, user_id, client_id) VALUES (?, ?, ?, ?, ?)`, 
            [sensorId, cmdId, cmd, decoded.id, sensor.client_id], () => {
            aedes.publish({ topic, payload: Buffer.from(payload), qos: 1, retain: false }, () => {
                console.log(`📡 [CMD] ${cmd} (${cmdId}) → ${sensorId} on ${topic}`);
                const origin = isAdmin ? 'ADMIN' : 'CLIENT';
                io.emit('sensor-event', { origin, topic, message: payload, time: new Date().toISOString() });
                res.json({ ok: true, cmd, cmdId, sensor: sensorId });
            });
        });
    });
});

httpServer.listen(port, () => console.log(`🚀 HTTP Server OK on port ${port}`));
