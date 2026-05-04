-- ==============================================================
--  Módulo: Check List de Expedientes de Pago
--  Ejecutar UNA SOLA VEZ sobre la base control_interno
-- ==============================================================

USE control_interno;

-- ------------------------------------------------------------
-- Tabla: checklist_expediente
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist_expediente (
  id                      INT           AUTO_INCREMENT PRIMARY KEY,
  numero                  VARCHAR(10)   NOT NULL UNIQUE            COMMENT 'Folio correlativo 0001…',
  numero_folios           VARCHAR(100)  NULL                       COMMENT 'Número de Folios Expediente',
  numero_expediente       VARCHAR(100)  NULL                       COMMENT 'Número de Expediente',

  -- Checkboxes de documentación (0 = no marcado, 1 = marcado)
  orden_pago_da           TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Orden de Pago D.A.',
  validacion_factura_sar  TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Validación de Factura SAR',
  formato_sap             TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Formato SAP',
  orden_compra            TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Orden de Compra',
  acta_recepcion          TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Acta de Recepción',
  resumen_cotizacion      TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Resumen Cotización',
  acta_entrega            TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Acta de Entrega',
  cotizaciones            TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Cotizaciones',
  factura_original        TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Factura Original',
  memo_requisicion        TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Memo de Requisición',
  solicitud_eventos       TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Solicitud de Eventos',
  informe_tecnico         TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Informe Técnico',
  validacion_rtn          TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Validación RTN Proveedores',
  constancia_legal        TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Constancia Información Legal Proveedores',
  solvencia_fiscal        TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Solvencia Fiscal',
  otros                   TINYINT(1)    NOT NULL DEFAULT 0         COMMENT 'Otros',

  -- Área de observaciones
  observaciones           TEXT          NULL,

  -- Auditoría
  creado_por              INT           NOT NULL,
  fecha_creacion          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_cl_creado FOREIGN KEY (creado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Módulo en el sistema
-- ------------------------------------------------------------
INSERT IGNORE INTO modulos (nombre, clave)
  VALUES ('Check List Expedientes', 'checklist');

-- ------------------------------------------------------------
-- Permiso inicial para SUPER_ADMIN (id = 1)
-- ------------------------------------------------------------
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'checklist';
