-- Agrega DNI y teléfono del beneficiario a las ayudas sociales
ALTER TABLE ayudas_sociales
  ADD COLUMN beneficiario_dni      VARCHAR(13) NULL AFTER beneficiario,
  ADD COLUMN beneficiario_telefono VARCHAR(20) NULL AFTER beneficiario_dni;
