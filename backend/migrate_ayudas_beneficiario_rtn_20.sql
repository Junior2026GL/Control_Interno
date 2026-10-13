-- RTN del beneficiario: ampliar a 20 caracteres
ALTER TABLE ayudas_sociales MODIFY COLUMN beneficiario_rtn VARCHAR(20) NULL;
