-- Sexo del beneficiario en la Campaña Ayudas Whatsapp (M = Hombre, F = Mujer)
-- Se llena solo desde censo_nacional al registrar una ayuda social.
ALTER TABLE beneficiarios_ayuda
  ADD COLUMN sexo CHAR(1) NULL AFTER departamento;

-- Carga inicial: toma el sexo del censo para los beneficiarios que ya existen
UPDATE beneficiarios_ayuda b
JOIN censo_nacional c ON c.NUMERO_IDENTIDAD = b.dni
SET b.sexo = CASE
  WHEN UPPER(c.SEXO) LIKE 'F%' OR UPPER(c.SEXO) LIKE '%MUJER%'  THEN 'F'
  WHEN UPPER(c.SEXO) LIKE 'M%' OR UPPER(c.SEXO) LIKE '%HOMBRE%' THEN 'M'
  ELSE NULL
END;
