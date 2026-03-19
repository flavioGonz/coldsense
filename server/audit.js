const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/Flavio/Documents/EXPRESS/Cold Sense Esp32/server/database.sqlite');

console.log('--- AUDITORIA DE SEGURIDAD SAAS ---');

db.all(`SELECT id, name FROM clients`, (err, clients) => {
    console.log('\n🏢 Clientes (Empresas):');
    console.table(clients);
    
    db.all(`SELECT id, username, client_id, role FROM users`, (err, users) => {
        console.log('\n👤 Usuarios (Login):');
        console.table(users);
        
        db.all(`SELECT id, name, client_id, status FROM sensors`, (err, sensors) => {
            console.log('\n🛰️ Sensores (Hardware):');
            console.table(sensors);
            db.close();
        });
    });
});
