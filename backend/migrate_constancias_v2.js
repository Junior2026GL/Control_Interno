require('dotenv').config();
const db = require('./db');

// Adds tipo_cuenta column and makes banco_emisor nullable
const queries = [
  `ALTER TABLE constancias_transferencia ADD COLUMN IF NOT EXISTS tipo_cuenta VARCHAR(100)`,
  `ALTER TABLE constancias_transferencia MODIFY COLUMN banco_emisor VARCHAR(100)`,
];

let done = 0;
queries.forEach((sql, i) => {
  db.query(sql, (err) => {
    if (err) {
      console.error(`ERROR en query ${i + 1}:`, err.message);
    } else {
      console.log(`Query ${i + 1} OK`);
    }
    done++;
    if (done === queries.length) process.exit(0);
  });
});
