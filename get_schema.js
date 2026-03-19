const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/Flavio/Documents/EXPRESS/Cold Sense Esp32/server/database.sqlite');
db.all("PRAGMA table_info(sensors)", (err, rows) => {
    console.log(JSON.stringify(rows || [], null, 2));
    db.close();
});
