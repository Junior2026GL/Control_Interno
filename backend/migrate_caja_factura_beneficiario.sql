-- ============================================================
-- Migración: agregar campos factura y beneficiario a caja_chica
-- ============================================================

ALTER TABLE caja_chica
  ADD COLUMN factura      VARCHAR(100)  NULL AFTER descripcion,
  ADD COLUMN beneficiario VARCHAR(150)  NULL AFTER factura;
