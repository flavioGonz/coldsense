const db = require('./database');

setTimeout(() => {
    // 1. Create branches table
    db.run(`CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        lat REAL,
        lng REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients (id)
    )`, (err) => {
        if (err) console.log('branches table:', err.message);
        else console.log('✅ branches table OK');
    });

    // 2. Add branch_id to sensors
    db.run(`ALTER TABLE sensors ADD COLUMN branch_id INTEGER REFERENCES branches(id)`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ branch_id column OK');
    });

    // 3. Add adopted_at to sensors if missing
    db.run(`ALTER TABLE sensors ADD COLUMN adopted_at DATETIME`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ adopted_at column OK');
    });

    setTimeout(() => {
        console.log('Migration v2 complete!');
        process.exit(0);
    }, 1000);
}, 500);
