-- ============================================================
--  Modulo: Alcaldes Municipales
--  Ejecutar en: Railway MySQL (control_interno)
-- ============================================================

USE control_interno;

-- Registrar modulo
INSERT IGNORE INTO modulos (clave, nombre)
VALUES ('alcaldes', 'Alcaldes Municipales');

-- Dar acceso al superadmin automaticamente
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
SELECT 1, id FROM modulos WHERE clave = 'alcaldes';
