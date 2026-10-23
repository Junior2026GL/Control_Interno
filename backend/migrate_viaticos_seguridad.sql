-- ============================================================
-- Módulo: Viáticos Seguridad de Presidencia
-- Ejecutar en la base de datos de control_interno
-- (el permiso 'viaticos-seguridad' ya existe en la tabla modulos)
-- ============================================================

CREATE TABLE IF NOT EXISTS viaticos_seguridad (
  id                    INT           AUTO_INCREMENT PRIMARY KEY,
  numero_identidad      VARCHAR(20)   NOT NULL                    COMMENT 'DNI de quien recibe (13 dígitos)',
  nombre_beneficiario   VARCHAR(300)  NOT NULL                    COMMENT 'Nombre de quien recibe (del censo)',
  mision                TEXT          NOT NULL,
  lugar                 VARCHAR(300)  NOT NULL,
  dependencia           VARCHAR(200)  NOT NULL DEFAULT '',
  cargo                 VARCHAR(200)  NOT NULL DEFAULT '',
  encargado_mision      VARCHAR(300)  NULL,
  periodo_desde         DATE          NOT NULL,
  periodo_hasta         DATE          NOT NULL,
  hora_salida           VARCHAR(20)   NULL,
  hora_regreso          VARCHAR(20)   NULL,
  monto_hospedaje       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_alimentacion    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_combustible     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_imprevistos     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  otros_descripcion     VARCHAR(300)  NULL,
  monto_otros           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  gran_total            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  detalle_alimentacion  TEXT          NULL COMMENT 'JSON: [{nombre, cargo, dias:[{fecha, monto}]}]',
  detalle_hospedaje     TEXT          NULL COMMENT 'JSON: [{detalle, cantidad, dias:[{fecha, monto}]}]',
  detalle_combustible   TEXT          NULL COMMENT 'JSON: [{nombre, detalle, monto}]',
  observaciones         TEXT          NULL,
  usuario_id            INT           NOT NULL,
  creado_en             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vs_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  INDEX idx_vs_identidad (numero_identidad),
  INDEX idx_vs_fecha     (periodo_desde),
  INDEX idx_vs_nombre    (nombre_beneficiario(80))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Recibos de viáticos de Seguridad de Presidencia';
