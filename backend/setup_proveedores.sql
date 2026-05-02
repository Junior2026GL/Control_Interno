-- ============================================================
--  Módulo: Base de Datos de Proveedores
--  Ejecutar en: Railway MySQL (control_interno)
-- ============================================================

USE control_interno;

CREATE TABLE IF NOT EXISTS proveedores (
  id                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  nombre            VARCHAR(200)     NOT NULL,
  rtn               VARCHAR(20)      NULL,
  rp                VARCHAR(50)      NULL,
  categoria         VARCHAR(80)      NOT NULL,
  tipo_servicio     VARCHAR(200)     NULL,
  vendedor          VARCHAR(200)     NULL,
  telefono          VARCHAR(30)      NULL,
  correo            VARCHAR(150)     NULL,
  direccion         VARCHAR(300)     NULL,
  estado            ENUM('ACTIVO','INACTIVO','SUSPENDIDO') NOT NULL DEFAULT 'ACTIVO',
  -- Evaluación (1-5 por criterio)
  eval_calidad      TINYINT UNSIGNED NULL CHECK (eval_calidad BETWEEN 1 AND 5),
  eval_puntualidad  TINYINT UNSIGNED NULL CHECK (eval_puntualidad BETWEEN 1 AND 5),
  eval_precio       TINYINT UNSIGNED NULL CHECK (eval_precio BETWEEN 1 AND 5),
  eval_servicio     TINYINT UNSIGNED NULL CHECK (eval_servicio BETWEEN 1 AND 5),
  observaciones     TEXT             NULL,
  registrado_por    VARCHAR(100)     NULL,
  created_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rtn (rtn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registrar módulo
INSERT IGNORE INTO modulos (clave, nombre)
VALUES ('proveedores', 'Base de Datos Proveedores');

-- Acceso automático al superadmin
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
SELECT 1, id FROM modulos WHERE clave = 'proveedores';
