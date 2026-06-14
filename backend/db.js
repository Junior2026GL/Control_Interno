const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host:              process.env.DB_HOST,
  port:              parseInt(process.env.DB_PORT || '3306', 10),
  user:              process.env.DB_USER,
  password:          process.env.DB_PASSWORD,
  database:          process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:   20,
  queueLimit:        0,
});

// Verify connection on startup
pool.getConnection((err, conn) => {
  if (err) {
    console.error('Error conectando a la DB:', err.message);
    console.error('Verifique las variables de entorno: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME');
    process.exit(1);
  }
  console.log('Base de datos conectada');
  conn.release();
});

module.exports = pool;