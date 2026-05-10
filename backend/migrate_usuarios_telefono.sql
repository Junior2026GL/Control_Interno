-- ============================================================
--  Migración: agregar campo telefono a la tabla usuarios
--  Ejecutar una sola vez en la base de datos de producción
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN telefono VARCHAR(20) NULL COMMENT 'Número de teléfono del usuario' AFTER email;
