const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to SQLite database.');
    db.serialize(() => {
      // 1. Clients Table (Master SaaS Registry)
      db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_name TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        address TEXT,
        lat REAL,
        lng REAL,
        status TEXT DEFAULT 'active',
        plan TEXT DEFAULT 'premium',
        max_devices INTEGER DEFAULT 50,
        subscription_end DATETIME,
        api_key TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 2. Users Table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        client_id INTEGER,
        role TEXT DEFAULT 'user',
        FOREIGN KEY (client_id) REFERENCES clients (id)
      )`);

      // 3. Sensors Table (Fleet)
      db.run(`CREATE TABLE IF NOT EXISTS sensors (
        id TEXT PRIMARY KEY,
        client_id INTEGER,
        name TEXT,
        status TEXT DEFAULT 'pending',
        fw TEXT,
        model TEXT,
        ip TEXT,
        mac TEXT,
        rssi INTEGER,
        uptime_secs INTEGER,
        cam_id TEXT,
        local_id TEXT,
        door_name TEXT DEFAULT 'Puerta principal',
        temp_min REAL DEFAULT -22.0,
        temp_max REAL DEFAULT -18.0,
        hum_max REAL DEFAULT 75.0,
        door_max_mins INTEGER DEFAULT 5,
        buzzer_enabled BOOLEAN DEFAULT 1,
        lat REAL,
        lng REAL,
        last_seen DATETIME,
        FOREIGN KEY (client_id) REFERENCES clients (id)
      )`);

      // 4. Telemetry
      db.run(`CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_id TEXT,
        type TEXT,
        temp_interior REAL,
        temp_exterior REAL,
        hum_exterior REAL,
        door_open BOOLEAN,
        rssi INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sensor_id) REFERENCES sensors (id)
      )`);

      // 5. Firmware Table
      db.run(`CREATE TABLE IF NOT EXISTS firmwares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT UNIQUE,
        filename TEXT,
        changelog TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 6. Event History
      db.run(`CREATE TABLE IF NOT EXISTS event_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_id TEXT,
        topic TEXT,
        payload TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 7. Command History
      db.run(`CREATE TABLE IF NOT EXISTS command_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_id TEXT,
        command TEXT,
        status TEXT DEFAULT 'pending',
        cmd_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        ack_at DATETIME
      )`);

      // Initial Seed Data
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('flavio20', salt);
      db.run(`INSERT OR IGNORE INTO users (username, password_hash, role) VALUES ('flavio', ?, 'admin')`, [hash]);
      db.run(`INSERT OR IGNORE INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')`, [hash]);
      
      db.run(`INSERT OR IGNORE INTO firmwares (version, filename, changelog) VALUES (?,?,?)`, 
        ['v1.0.0-STABLE', '/uploads/firmwares/optimal.bin', '# ColdSense Core v1.0.0\n- Optimized WiFi Power Management\n- Secure MQTT Tunneling (TLS Ready)\n- High Fidelity Sensor Sampling (1Hz)\n- OTA Self-Healing logic']);
    });
  }
});

module.exports = db;
