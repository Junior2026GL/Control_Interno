require('dotenv').config();
const db = require('./db');

// v4: soporta tipo de constancia (transferencia / transferencia con custodia)
// y crea la tabla para el nuevo tipo "Compromiso de Liquidación, Devolución y Recibo"
const alterQueries = [
  `ALTER TABLE constancias_transferencia ADD COLUMN tipo_constancia ENUM('transferencia','transferencia_custodia') NOT NULL DEFAULT 'transferencia' AFTER id`,
  `ALTER TABLE constancias_transferencia ADD COLUMN cuenta_nombre VARCHAR(200) NULL`,
  `ALTER TABLE constancias_transferencia ADD COLUMN custodia_nombre VARCHAR(200) NULL`,
  `ALTER TABLE constancias_transferencia ADD COLUMN custodia_dni VARCHAR(50) NULL`,
  `ALTER TABLE constancias_transferencia ADD COLUMN custodia_cargo VARCHAR(150) NULL`,
  `ALTER TABLE constancias_transferencia ADD COLUMN custodia_fecha DATE NULL`,
];

const createLiquidacion = `
  CREATE TABLE IF NOT EXISTS constancias_liquidacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    representante_nombre VARCHAR(200) NOT NULL,
    representante_dni VARCHAR(50) NOT NULL,
    institucion VARCHAR(200) NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    plazo_dias INT NOT NULL DEFAULT 30,
    correo VARCHAR(150) NULL,
    celular VARCHAR(50) NULL,
    fecha_compromiso DATE NULL,
    usuario_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_constliq_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

let done = 0;
alterQueries.forEach((sql, i) => {
  db.query(sql, (err) => {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      console.error(`ERROR en query ${i + 1}:`, err.message);
    } else {
      console.log(`Query ${i + 1} OK${err ? ' (columna ya existe)' : ''}`);
    }
    done++;
    if (done === alterQueries.length) crearTablaLiquidacion();
  });
});

function crearTablaLiquidacion() {
  db.query(createLiquidacion, (err) => {
    if (err) {
      console.error('ERROR creando constancias_liquidacion:', err.message);
    } else {
      console.log('Tabla constancias_liquidacion OK.');
    }
    process.exit(0);
  });
}
