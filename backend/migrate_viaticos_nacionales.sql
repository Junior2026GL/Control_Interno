-- ============================================================
-- Módulo: Viáticos Nacionales (Empleados)
-- Ejecutar en la base de datos de control_interno
-- ============================================================

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS viaticos_nacionales (
  id                    INT           AUTO_INCREMENT PRIMARY KEY,
  numero_identidad      VARCHAR(20)   NOT NULL                    COMMENT 'DNI del beneficiario (13 dígitos)',
  nombre_beneficiario   VARCHAR(300)  NOT NULL                    COMMENT 'Nombre completo del beneficiario (del censo)',
  mision                TEXT          NOT NULL                    COMMENT 'Descripción de la misión/viaje',
  lugar                 VARCHAR(300)  NOT NULL,
  dependencia           VARCHAR(200)  NOT NULL DEFAULT '',
  cargo                 VARCHAR(200)  NOT NULL DEFAULT '',
  encargado_mision      VARCHAR(300)  NULL,
  periodo_desde         DATE          NOT NULL,
  periodo_hasta         DATE          NOT NULL,
  sabado                TINYINT(1)    NOT NULL DEFAULT 0,
  hora_salida           VARCHAR(20)   NULL,
  hora_regreso          VARCHAR(20)   NULL,
  monto_hospedaje       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_combustible     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_depreciacion    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_imprevistos     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  otros_descripcion     VARCHAR(300)  NULL,
  monto_otros           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  gran_total            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  dias_detalle          TEXT          NULL                        COMMENT 'JSON: [{fecha, monto}] detalle diario de hospedaje',
  observaciones         TEXT          NULL,
  usuario_id            INT           NOT NULL,
  creado_en             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vn_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
  INDEX idx_vn_identidad (numero_identidad),
  INDEX idx_vn_fecha     (periodo_desde),
  INDEX idx_vn_nombre    (nombre_beneficiario(80))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Recibos de viáticos nacionales para empleados';

-- 2. Registrar módulo en el catálogo
INSERT IGNORE INTO modulos (clave, nombre)
  VALUES ('viaticos-nacionales', 'Viáticos Nacionales');

-- 3. Asignar al SUPER_ADMIN (id = 1)
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'viaticos-nacionales';
