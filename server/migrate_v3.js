const db = require('./database');

setTimeout(() => {
    // 1. Update clients table for subscriptions
    db.run(`ALTER TABLE clients ADD COLUMN subscription_end DATETIME`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ subscription_end column OK');
    });
    db.run(`ALTER TABLE clients ADD COLUMN max_devices INTEGER DEFAULT 10`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ max_devices column OK');
    });

    // 2. Add image_url to sensors
    db.run(`ALTER TABLE sensors ADD COLUMN image_url TEXT`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ image_url column OK');
    });

    // 3. Create event_history table
    db.run(`CREATE TABLE IF NOT EXISTS event_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_id TEXT,
        topic TEXT,
        payload TEXT,
        timestamp DATETIME DEFAULT (datetime('now', 'localtime'))
    )`, (err) => {
        if (err) console.log('event_history table:', err.message);
        else console.log('✅ event_history table OK');
    });

    setTimeout(() => {
        console.log('Migration v3 complete!');
        process.exit(0);
    }, 1000);
}, 500);
