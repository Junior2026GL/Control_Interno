require('dotenv').config();
const db = require('./db');

// Adds nombre_entidad, rtn, ciudad_firma columns
const queries = [
  `ALTER TABLE constancias_transferencia ADD COLUMN nombre_entidad VARCHAR(200)`,
  `ALTER TABLE constancias_transferencia ADD COLUMN rtn VARCHAR(50)`,
  `ALTER TABLE constancias_transferencia ADD COLUMN ciudad_firma VARCHAR(150)`,
];

let done = 0;
queries.forEach((sql, i) => {
  db.query(sql, (err) => {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error(`ERROR en query ${i + 1}:`, err.message);
    } else {
      console.log(`Query ${i + 1} OK${err ? ' (columna ya existe)' : ''}`);
    }
    done++;
    if (done === queries.length) process.exit(0);
  });
});
