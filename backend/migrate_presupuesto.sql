-- ============================================================
--  Migración: Módulo Presupuesto Social por Diputado
--  Fecha: 2026-03-29
-- ============================================================

USE control_interno;

-- Registrar módulo y asignarlo al SUPER_ADMIN (usuario id=1)
INSERT IGNORE INTO modulos (clave, nombre) VALUES ('presupuesto-social', 'Presupuesto Social');
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'presupuesto-social';

-- Tabla: presupuesto anual asignado a cada diputado
CREATE TABLE IF NOT EXISTS presupuesto_diputados (
  id             INT            AUTO_INCREMENT PRIMARY KEY,
  diputado_id    INT            NOT NULL,
  anio           YEAR           NOT NULL,
  monto_asignado DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  observaciones  TEXT           NULL,
  created_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by     INT            NULL,
  UNIQUE KEY uq_diputado_anio (diputado_id, anio),
  CONSTRAINT fk_pd_diputado FOREIGN KEY (diputado_id)
    REFERENCES diputados(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: ayudas sociales descontadas del presupuesto
CREATE TABLE IF NOT EXISTS ayudas_sociales (
  id             INT            AUTO_INCREMENT PRIMARY KEY,
  presupuesto_id INT            NOT NULL,
  diputado_id    INT            NOT NULL,
  fecha          DATE           NOT NULL,
  concepto       VARCHAR(300)   NOT NULL,
  beneficiario   VARCHAR(200)   NULL,
  monto          DECIMAL(14,2)  NOT NULL,
  observaciones  TEXT           NULL,
  created_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by     INT            NULL,
  CONSTRAINT fk_as_presupuesto FOREIGN KEY (presupuesto_id)
    REFERENCES presupuesto_diputados(id) ON DELETE CASCADE,
  CONSTRAINT fk_as_diputado FOREIGN KEY (diputado_id)
    REFERENCES diputados(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
