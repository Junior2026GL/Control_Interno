const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host:              process.env.DB_HOST,
  user:              process.env.DB_USER,
  password:          process.env.DB_PASSWORD,
  database:          process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:   10,
  queueLimit:        0,
});

// Verify connection on startup
pool.getConnection((err, conn) => {
  if (err) {
    console.error('Error conectando a la DB:', err);
    return;
  }
  console.log('Base de datos conectada');
  conn.release();
});

module.exports = pool;