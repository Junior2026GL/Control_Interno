-- Departamento donde vive el beneficiario de la ayuda social
ALTER TABLE ayudas_sociales
  ADD COLUMN beneficiario_departamento VARCHAR(30) NULL AFTER beneficiario_telefono;
