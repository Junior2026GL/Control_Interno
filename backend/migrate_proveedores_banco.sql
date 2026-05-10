-- ============================================================
--  Migración: proveedores — columnas nombre_banco y tipo_cuenta
--  Ejecutar en MySQL/MariaDB una sola vez
--  Fecha: 2026-05-09
-- ============================================================

ALTER TABLE proveedores
  ADD COLUMN nombre_banco VARCHAR(150) NULL
    COMMENT 'Nombre del banco del proveedor'
    AFTER cuenta_proveedor,
  ADD COLUMN tipo_cuenta  VARCHAR(50)  NULL
    COMMENT 'Tipo de cuenta: Cuenta Corriente | Cuenta de Ahorro | Cuenta Maestra'
    AFTER nombre_banco;
