-- ============================================================
--  Módulo: Ayudas Sociales a Alcaldías
--  Fecha: 2026-04-28
--  Ejecutar en: Railway MySQL (control_interno)
-- ============================================================

USE control_interno;

-- ------------------------------------------------------------
-- Tabla principal
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ayudas_alcaldias (
  id                  INT            AUTO_INCREMENT PRIMARY KEY,
  no_cheque           VARCHAR(30)    NULL,
  cuenta              VARCHAR(30)    NULL,
  beneficiario        VARCHAR(200)   NOT NULL,
  departamento        VARCHAR(80)    NOT NULL,
  orden_pago          VARCHAR(40)    NULL,
  descripcion         TEXT           NOT NULL,
  total               DECIMAL(12,2)  NOT NULL,
  estado_entrega      ENUM('entregado','pendiente') NOT NULL DEFAULT 'pendiente',
  fecha_entrega       DATE           NULL          COMMENT 'Fecha real de entrega del cheque',
  debitado            TINYINT(1)     NOT NULL DEFAULT 0,
  liquidado           TINYINT(1)     NOT NULL DEFAULT 0,
  fecha_liquidacion   DATE           NULL,
  partido             ENUM('PN','PL','LB','DC','PINU') NULL,
  mes                 VARCHAR(20)    NULL,
  anio                SMALLINT       NULL          COMMENT 'Año fiscal del registro',
  usuario_id          INT            NOT NULL,
  created_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Migración: agregar columna anio si la tabla ya existe sin ella
-- ------------------------------------------------------------
-- ALTER TABLE ayudas_alcaldias ADD COLUMN anio SMALLINT NULL COMMENT 'Año fiscal' AFTER mes;

-- ------------------------------------------------------------
-- Registrar módulo en la tabla modulos
-- ------------------------------------------------------------
INSERT IGNORE INTO modulos (clave, nombre)
VALUES ('ayudas_alcaldias', 'Ayudas Alcaldías');

-- ------------------------------------------------------------
-- Dar acceso al superadmin (usuario id=1) automáticamente
-- ------------------------------------------------------------
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
SELECT 1, id FROM modulos WHERE clave = 'ayudas_alcaldias';
