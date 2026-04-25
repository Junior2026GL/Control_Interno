require('dotenv').config();
const db = require('./db');

const sql = `
  CREATE TABLE IF NOT EXISTS constancias_transferencia (
    id             INT PRIMARY KEY AUTO_INCREMENT,
    nombre         VARCHAR(200) NOT NULL,
    dni            VARCHAR(50)  NOT NULL,
    telefono       VARCHAR(30),
    direccion      VARCHAR(255),
    correo         VARCHAR(100),
    funcionario    VARCHAR(200),
    cargo          VARCHAR(100),
    dependencia    VARCHAR(150),
    monto          DECIMAL(14,2) NOT NULL,
    banco_emisor   VARCHAR(100)  NOT NULL,
    banco_receptor VARCHAR(100)  NOT NULL,
    numero_cuenta  VARCHAR(100)  NOT NULL,
    fecha_dia      TINYINT      NOT NULL,
    fecha_mes      VARCHAR(20)  NOT NULL,
    fecha_anio     SMALLINT     NOT NULL,
    concepto       TEXT         NOT NULL,
    usuario_id     INT,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

db.query(sql, (err) => {
  if (err) {
    console.error('ERROR creando tabla:', err.message);
    process.exit(1);
  }
  console.log('Tabla constancias_transferencia creada / ya existe. OK');
  process.exit(0);
});
