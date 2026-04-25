require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [cols] = await conn.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
    [process.env.DB_NAME, 'ayudas_sociales', 'estado_liquidacion']
  );

  if (!cols.length) {
    await conn.query(
      "ALTER TABLE ayudas_sociales ADD COLUMN estado_liquidacion ENUM('sin_liquidar','en_proceso','liquido') NOT NULL DEFAULT 'sin_liquidar'"
    );
    console.log('OK: columna estado_liquidacion agregada.');
  } else {
    console.log('OK: columna ya existe.');
  }

  await conn.end();
})().catch(e => { console.error(e); process.exit(1); });
