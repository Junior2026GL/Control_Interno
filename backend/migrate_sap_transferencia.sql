-- ============================================================
-- Módulo: SAP Transferencia (Solicitud de Asignación Presupuestaria)
-- Fase 2 — requiere haber ejecutado antes migrate_orden_sap_transferencia.sql
-- Ejecutar en la base de datos de control_interno
-- ============================================================

-- 1. Tabla de solicitudes SAP
CREATE TABLE IF NOT EXISTS sap_transferencia (
  id                  INT            AUTO_INCREMENT PRIMARY KEY,
  orden_id            INT            NOT NULL                  COMMENT 'Orden (correlativo) que usa este SAP',
  numero              INT            NOT NULL                  COMMENT 'N° del correlativo (se muestra 0303)',
  anio                SMALLINT       NOT NULL,
  fecha_solicitud     DATE           NOT NULL,
  unidad_solicitante  VARCHAR(200)   NOT NULL DEFAULT 'PAGADURIA ESPECIAL',
  monto_cotizacion    DECIMAL(14,2)  NOT NULL                  COMMENT 'Monto según cotización',
  estado              ENUM('activo','anulado') NOT NULL DEFAULT 'activo',
  motivo_anulacion    VARCHAR(500)   NULL,
  anulado_por         INT            NULL,
  fecha_anulacion     DATETIME       NULL,
  creado_por          INT            NOT NULL,
  creado_en           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sap_orden    FOREIGN KEY (orden_id)    REFERENCES orden_sap_transferencia(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sap_creador  FOREIGN KEY (creado_por)  REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sap_anulador FOREIGN KEY (anulado_por) REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE KEY uq_sap_orden (orden_id),
  UNIQUE KEY uq_sap_anio_numero (anio, numero),
  INDEX idx_sap_fecha  (fecha_solicitud),
  INDEX idx_sap_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Solicitudes de Asignación Presupuestaria (SAP) - Transferencia';

-- 2. Registrar el módulo en el catálogo
INSERT IGNORE INTO modulos (clave, nombre)
  VALUES ('sap-transferencia', 'SAP Transferencia');

-- 3. Asignar el módulo al SUPER_ADMIN (id = 1)
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'sap-transferencia';
