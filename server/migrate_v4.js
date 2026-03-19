const db = require('./database');

setTimeout(() => {
    console.log('🚀 Starting Migration v4...');
    
    // Add threshold columns to sensors
    db.run(`ALTER TABLE sensors ADD COLUMN temp_min REAL DEFAULT -20.0`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ temp_min column OK');
    });
    db.run(`ALTER TABLE sensors ADD COLUMN temp_max REAL DEFAULT 10.0`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ temp_max column OK');
    });

    // Add command tracking columns
    db.run(`ALTER TABLE sensors ADD COLUMN last_cmd_id TEXT`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ last_cmd_id column OK');
    });
    db.run(`ALTER TABLE sensors ADD COLUMN last_cmd_status TEXT DEFAULT 'pending'`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ last_cmd_status column OK');
    });
    db.run(`ALTER TABLE sensors ADD COLUMN last_ack_at DATETIME`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ last_ack_at column OK');
    });

    // Add more telemetry fields if missing (just in case)
    db.run(`ALTER TABLE sensors ADD COLUMN ip TEXT`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ ip column OK');
    });
    db.run(`ALTER TABLE sensors ADD COLUMN mac TEXT`, (err) => {
        if (!err || err.message.includes('duplicate')) console.log('✅ mac column OK');
    });

    setTimeout(() => {
        console.log('🎉 Migration v4 complete!');
        process.exit(0);
    }, 1000);
}, 500);
