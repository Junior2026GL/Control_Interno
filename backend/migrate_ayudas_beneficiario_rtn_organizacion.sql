-- RTN y Organización / Institución del beneficiario de la ayuda social
ALTER TABLE ayudas_sociales
  ADD COLUMN beneficiario_rtn VARCHAR(14) NULL AFTER beneficiario_departamento,
  ADD COLUMN beneficiario_organizacion VARCHAR(200) NULL AFTER beneficiario_rtn;
