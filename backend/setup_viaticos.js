const db = require('./db');

const sqls = [
  `CREATE TABLE IF NOT EXISTS viaticos_detalle (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    viatico_id INT NOT NULL,
    nombre     VARCHAR(200) NOT NULL,
    cargo      VARCHAR(100) NOT NULL,
    detalle    VARCHAR(100) NOT NULL DEFAULT 'ALIMENTACION Y HOSPEDAJE',
    FOREIGN KEY (viatico_id) REFERENCES viaticos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS viaticos_dias (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    viatico_id INT NOT NULL,
    fecha      DATE NOT NULL,
    monto      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (viatico_id) REFERENCES viaticos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `INSERT IGNORE INTO modulos (clave, nombre) VALUES ('viaticos', 'Viáticos')`,

  `INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
   SELECT 1, id FROM modulos WHERE clave = 'viaticos'`,
];

(async () => {
  for (const sql of sqls) {
    await new Promise((resolve, reject) => {
      db.query(sql, (err) => {
        if (err) { console.log('ERROR:', err.message); reject(err); }
        else { console.log('OK:', sql.slice(0, 60)); resolve(); }
      });
    });
  }
  console.log('\nTodas las tablas creadas correctamente.');
  process.exit(0);
})().catch(() => process.exit(1));
