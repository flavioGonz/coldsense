const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'database.sqlite'); // Changed extension to .sqlite for standard
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to SQLite database.');
    db.serialize(() => {
      // 1. Clients Table (Now with Status for SaaS Flow)
      db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        plan TEXT DEFAULT 'free',
        api_key TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 2. Users Table (Role-based access)
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        client_id INTEGER,
        role TEXT DEFAULT 'user',
        FOREIGN KEY (client_id) REFERENCES clients (id)
      )`);

      // 3. Sensors Table (Full Matrix Protocol v3.2)
      db.run(`CREATE TABLE IF NOT EXISTS sensors (
        id TEXT PRIMARY KEY,
        client_id INTEGER,
        name TEXT,
        status TEXT DEFAULT 'pending',
        fw TEXT,
        model TEXT,
        ip TEXT,
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

      // 4. Telemetry (Historical Log)
      db.run(`CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_id TEXT,
        type TEXT,
        temp_interior REAL,
        temp_exterior REAL,
        hum_exterior REAL,
        door_open BOOLEAN,
        door_open_mins INTEGER,
        alarm BOOLEAN,
        alarm_type TEXT,
        detail TEXT,
        rssi INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sensor_id) REFERENCES sensors (id)
      )`);

      // Initial Seed Data (Admin user for you)
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('flavio20', salt);
      db.run(`INSERT OR IGNORE INTO users (username, password_hash, role) VALUES ('flavio', ?, 'admin')`, [hash]);
    });
  }
});

module.exports = db;
