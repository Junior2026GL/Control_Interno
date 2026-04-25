const db = require('./db');

const sqls = [
  `CREATE TABLE IF NOT EXISTS ayudas (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    nombre_completo  VARCHAR(200)   NOT NULL,
    dni              VARCHAR(20)    NOT NULL,
    rtn              VARCHAR(25)    NOT NULL,
    fecha            DATE           NOT NULL,
    cantidad         DECIMAL(12,2)  NOT NULL,
    tipo_ayuda       VARCHAR(100)   NOT NULL,
    observaciones    TEXT,
    usuario_id       INT            NOT NULL,
    created_at       DATETIME       DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `INSERT IGNORE INTO modulos (clave, nombre) VALUES ('ayudas', 'Ayudas')`,

  `INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
   SELECT 1, id FROM modulos WHERE clave = 'ayudas'`,
];

(async () => {
  for (const sql of sqls) {
    await new Promise((resolve, reject) => {
      db.query(sql, (err) => {
        if (err) { console.log('ERROR:', err.message); reject(err); }
        else { console.log('OK:', sql.slice(0, 70)); resolve(); }
      });
    });
  }
  console.log('\nMódulo Ayudas configurado correctamente.');
  process.exit(0);
})().catch(() => process.exit(1));
