const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/Flavio/Documents/EXPRESS/Cold Sense Esp32/server/database.sqlite');

console.log('--- REPARANDO ROLES SAAS ---');

// Corregir usuarios existentes
db.run(`UPDATE users SET role = 'client' WHERE username != 'flavio'`, function(err) {
    if (err) console.error(err);
    console.log(`✅ ${this.changes} Usuarios actualizados a rol 'client'`);
    db.close();
});
