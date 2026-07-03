-- Agregar columna liquidado_por a ayudas_sociales
-- Guarda el ID del usuario que registró la liquidación
ALTER TABLE ayudas_sociales
  ADD COLUMN liquidado_por INT NULL DEFAULT NULL,
  ADD CONSTRAINT fk_ayudas_liquidado_por
    FOREIGN KEY (liquidado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
