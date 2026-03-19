const db = require('./database');

setTimeout(() => {
    console.log('🚀 Starting Migration v6...');
    
    // Create firmwares table
    db.run(`CREATE TABLE IF NOT EXISTS firmwares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT UNIQUE,
        filename TEXT,
        changelog TEXT,
        release_date DATETIME DEFAULT (datetime('now', 'localtime')),
        created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )`, (err) => {
        if (err) console.error('Error creating firmwares:', err.message);
        else console.log('✅ firmwares table OK');
    });

    setTimeout(() => {
        console.log('🎉 Migration v6 complete!');
        process.exit(0);
    }, 1000);
}, 500);
