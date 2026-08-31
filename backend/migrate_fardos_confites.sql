-- ============================================================
-- Módulo: Entrega de Fardos de Confites (Día del Niño)
-- Ejecutar en la base de datos de control_interno
-- ============================================================

-- 1. Tabla de registros de entrega
CREATE TABLE IF NOT EXISTS entrega_fardos_confites (
  id                 INT           AUTO_INCREMENT PRIMARY KEY,
  diputado_id        INT           NULL           COMMENT 'FK opcional a tabla diputados',
  diputado_nombre    VARCHAR(200)  NOT NULL,
  departamento       VARCHAR(100)  NOT NULL,
  partido            VARCHAR(100)  NULL,
  persona_retiro     VARCHAR(200)  NOT NULL        COMMENT 'Persona que recogió los fardos',
  fecha_entrega      DATE          NOT NULL,
  cantidad_recibida  INT           NOT NULL        COMMENT 'Cantidad de fardos entregados',
  numero_orden       VARCHAR(30)   NOT NULL,
  observaciones      TEXT          NULL,
  usuario_id         INT           NOT NULL        COMMENT 'Usuario que registró',
  creado_en          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_efc_usuario    FOREIGN KEY (usuario_id)   REFERENCES usuarios(id),
  CONSTRAINT fk_efc_diputado   FOREIGN KEY (diputado_id)  REFERENCES diputados(id) ON DELETE SET NULL,
  INDEX idx_efc_fecha      (fecha_entrega),
  INDEX idx_efc_diputado   (diputado_nombre),
  INDEX idx_efc_depto      (departamento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registro de entrega de fardos de confites – Actividad del Día del Niño';

-- 2. Registrar el módulo en el catálogo
INSERT IGNORE INTO modulos (clave, nombre)
  VALUES ('fardos-confites', 'Entrega de Fardos de Confites');

-- 3. Asignar el módulo al SUPER_ADMIN (id = 1)
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'fardos-confites';
