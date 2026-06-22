-- Agrega soporte de factura opcional al módulo de autorizaciones de pago
ALTER TABLE autorizaciones_pago
  ADD COLUMN lleva_factura TINYINT(1) NOT NULL DEFAULT 0 AFTER fondo,
  ADD COLUMN numero_factura VARCHAR(30) NULL AFTER lleva_factura;

-- Opcional: índice para búsquedas por número de factura
CREATE INDEX idx_autorizaciones_numero_factura ON autorizaciones_pago (numero_factura);
