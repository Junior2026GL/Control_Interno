-- Módulo "Campaña Ayudas Whatsapp"
-- Almacena los datos de cada beneficiario (único por DNI) cuando se registra una ayuda social.
-- La fecha de nacimiento se toma de censo_nacional; edad y cumpleaños se calculan al consultar.

CREATE TABLE IF NOT EXISTS beneficiarios_ayuda (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  dni              VARCHAR(13)  NOT NULL,
  nombre           VARCHAR(200) NOT NULL,
  telefono         VARCHAR(20)  NULL,
  departamento     VARCHAR(30)  NULL,
  fecha_nacimiento DATE         NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_beneficiarios_dni (dni),
  KEY idx_beneficiarios_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registrar el módulo y asignarlo al usuario administrador (id 1)
INSERT IGNORE INTO modulos (clave, nombre) VALUES ('beneficiarios-ayuda', 'Campaña Ayudas Whatsapp');
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'beneficiarios-ayuda';

-- Carga inicial con las ayudas ya registradas (toma el dato más reciente de cada DNI).
-- La fecha de nacimiento del censo viene como 'YYYY/MM/DD'.
INSERT IGNORE INTO beneficiarios_ayuda (dni, nombre, telefono, departamento, fecha_nacimiento)
SELECT a.beneficiario_dni,
       COALESCE(NULLIF(TRIM(a.beneficiario), ''), 'SIN NOMBRE'),
       a.beneficiario_telefono,
       a.beneficiario_departamento,
       STR_TO_DATE(REPLACE(LEFT(c.FECHA_NACIMIENTO, 10), '/', '-'), '%Y-%m-%d')
FROM ayudas_sociales a
JOIN (
  SELECT beneficiario_dni, MAX(id) AS max_id
  FROM ayudas_sociales
  WHERE beneficiario_dni IS NOT NULL AND beneficiario_dni <> ''
  GROUP BY beneficiario_dni
) m ON m.max_id = a.id
LEFT JOIN censo_nacional c ON c.NUMERO_IDENTIDAD = a.beneficiario_dni;
