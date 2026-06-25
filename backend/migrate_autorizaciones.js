const db = require('./db');

const sqlTabla = `
CREATE TABLE IF NOT EXISTS autorizaciones_pago (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero VARCHAR(10) NOT NULL UNIQUE,
  tipo_pago ENUM('CHEQUE','CONTRA_ENTREGA','TRANSFERENCIA','PAGO_LINEA') NOT NULL,
  beneficiario VARCHAR(200) NOT NULL,
  monto DECIMAL(15,2) NOT NULL,
  monto_letras VARCHAR(600) NOT NULL,
  detalle TEXT NOT NULL,
  anio YEAR NOT NULL,
  org VARCHAR(20) NOT NULL DEFAULT '',
  fondo VARCHAR(20) NOT NULL DEFAULT '',
  lleva_factura TINYINT(1) NOT NULL DEFAULT 0,
  numero_factura VARCHAR(30) NULL,
  estado ENUM('PENDIENTE','AUTORIZADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  creado_por INT NOT NULL,
  autorizado_por INT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_autorizacion DATETIME NULL,
  motivo_rechazo TEXT NULL,
  firma_nombre VARCHAR(200) NULL,
  CONSTRAINT fk_ap_creado FOREIGN KEY (creado_por) REFERENCES usuarios(id),
  CONSTRAINT fk_ap_autor  FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const sqlSecuencia = `
CREATE TABLE IF NOT EXISTS autorizaciones_secuencia (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  siguiente_numero INT UNSIGNED NOT NULL DEFAULT 1,
  actualizado_por INT NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_aut_seq_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

db.query(sqlTabla, (err) => {
  if (err) { console.error('ERROR tabla:', err.message); process.exit(1); }
  console.log('[1/4] Tabla autorizaciones_pago OK');

  db.query(sqlSecuencia, (err2) => {
    if (err2) { console.error('ERROR secuencia:', err2.message); process.exit(1); }
    console.log('[2/4] Tabla autorizaciones_secuencia OK');

    db.query(
      "INSERT IGNORE INTO modulos (nombre, clave) VALUES ('Autorizaciones de Pago', 'autorizaciones')",
      (err3) => {
        if (err3) { console.error('ERROR modulo:', err3.message); process.exit(1); }
        console.log('[3/4] Modulo autorizaciones OK');

        db.query(
          "INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id) SELECT 1, id FROM modulos WHERE clave = 'autorizaciones'",
          (err4) => {
            if (err4) { console.error('ERROR permisos:', err4.message); process.exit(1); }
            db.query(
              "INSERT IGNORE INTO autorizaciones_secuencia (id, siguiente_numero) VALUES (1, 1)",
              (err5) => {
                if (err5) { console.error('ERROR secuencia default:', err5.message); process.exit(1); }
                console.log('[4/4] Permisos SUPER_ADMIN OK');
                console.log('Migracion completada.');
                process.exit(0);
              }
            );
          }
        );
      }
    );
  });
});
