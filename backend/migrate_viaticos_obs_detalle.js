'use strict';
const db = require('./db');

db.query(
  `ALTER TABLE viaticos ADD COLUMN obs_detalle TEXT NULL AFTER nota2`,
  (err) => {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error('Error en migración:', err.message);
      process.exit(1);
    }
    console.log('OK — columna obs_detalle agregada (o ya existía).');
    process.exit(0);
  }
);
