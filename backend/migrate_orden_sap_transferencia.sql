-- ============================================================
-- Módulo: Órdenes de SAP Transferencia (correlativos por año)
-- Fase 1 del módulo SAP Transferencia
-- Ejecutar en la base de datos de control_interno
-- ============================================================

-- 1. Tabla de órdenes (correlativos)
CREATE TABLE IF NOT EXISTS orden_sap_transferencia (
  id              INT          AUTO_INCREMENT PRIMARY KEY,
  numero          INT          NOT NULL                  COMMENT 'Correlativo dentro del año (se muestra 0001, 0002...)',
  anio            SMALLINT     NOT NULL,
  estado          ENUM('libre','reservado','usado') NOT NULL DEFAULT 'libre',
  usuario_id      INT          NULL                      COMMENT 'Usuario que la reservó o usó',
  fecha_registro  DATETIME     NULL                      COMMENT 'Fecha de reserva / uso',
  sap_id          INT          NULL                      COMMENT 'SAP que la usó (se completa en la fase 2)',
  creado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_osap_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE KEY uq_osap_anio_numero (anio, numero),
  INDEX idx_osap_estado (anio, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Correlativos (órdenes) de SAP Transferencia por año';

-- 2. Registrar el módulo en el catálogo
INSERT IGNORE INTO modulos (clave, nombre)
  VALUES ('orden-sap-transferencia', 'Órdenes de SAP Transferencia');

-- 3. Asignar el módulo al SUPER_ADMIN (id = 1)
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'orden-sap-transferencia';
