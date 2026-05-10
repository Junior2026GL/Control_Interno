-- ============================================================
--  Migración: agregar columnas pais y ciudad a la tabla auditoria
--  Ejecutar una sola vez en la base de datos de producción
-- ============================================================

ALTER TABLE auditoria
  ADD COLUMN pais   VARCHAR(10)  NULL COMMENT 'Código ISO 2 del país (ej: HN, US)'  AFTER ip,
  ADD COLUMN ciudad VARCHAR(100) NULL COMMENT 'Ciudad detectada por GeoIP (geoip-lite)' AFTER pais;
