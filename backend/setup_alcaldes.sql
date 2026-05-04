-- ============================================================
--  Modulo: Alcaldes Municipales
--  Ejecutar en: Railway MySQL (control_interno)
-- ============================================================

USE control_interno;

-- Crear tabla alcaldes
CREATE TABLE IF NOT EXISTS alcaldes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  departamento VARCHAR(100) NOT NULL,
  municipio    VARCHAR(150) NOT NULL,
  alcalde      VARCHAR(200) NOT NULL,
  partido      VARCHAR(50)  NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registrar modulo
INSERT IGNORE INTO modulos (clave, nombre)
VALUES ('alcaldes', 'Alcaldes Municipales');

-- Dar acceso al superadmin automaticamente
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
SELECT 1, id FROM modulos WHERE clave = 'alcaldes';
