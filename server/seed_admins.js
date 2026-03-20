const db = require('./database');
const bcrypt = require('bcryptjs');

const admins = [
    { username: 'admin', password: 'flavio20', role: 'admin' },
    { username: 'admin2', password: 'flavio20', role: 'admin' }
];

admins.forEach(u => {
    const hash = bcrypt.hashSync(u.password, 10);
    db.run(
        `INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
        [u.username, hash, u.role],
        (err) => {
            if (err) console.error(`❌ Error creando ${u.username}:`, err.message);
            else console.log(`✅ Usuario creado: ${u.username} (admin)`);
        }
    );
});

setTimeout(() => {
    console.log('📡 [DB] Admins listos. Cerrando...');
    process.exit(0);
}, 2000);
