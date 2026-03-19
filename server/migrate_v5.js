const db = require('./database');

setTimeout(() => {
    console.log('🚀 Starting Migration v5...');
    
    // Create command_history table
    db.run(`CREATE TABLE IF NOT EXISTS command_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_id TEXT,
        cmd_id TEXT,
        command TEXT,
        status TEXT DEFAULT 'pending',
        user_id INTEGER,
        client_id INTEGER,
        timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
        ack_at DATETIME
    )`, (err) => {
        if (err) console.error('Error creating command_history:', err.message);
        else console.log('✅ command_history table OK');
    });

    // Add push_subscription to users (for PWA notifications)
    db.run(`ALTER TABLE users ADD COLUMN push_subscription TEXT`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ push_subscription column OK');
    });

    setTimeout(() => {
        console.log('🎉 Migration v5 complete!');
        process.exit(0);
    }, 1000);
}, 500);
