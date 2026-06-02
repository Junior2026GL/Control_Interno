-- ============================================================
-- MÓDULO: Viáticos de Diputados
-- Descripción: Registro de viáticos (hospedaje, alimentación,
--              transporte y otros gastos) para diputados propietarios
--              y suplentes del Congreso Nacional.
-- ============================================================

CREATE TABLE IF NOT EXISTS viaticos_diputados (
  id                    INT           NOT NULL AUTO_INCREMENT,
  diputado_id           INT           NOT NULL,

  -- Información del viaje
  motivo                VARCHAR(500)  NOT NULL COMMENT 'Motivo o descripción del viaje/evento',
  lugar                 VARCHAR(255)  NOT NULL COMMENT 'Lugar / ciudad de destino',
  destino_internacional TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1 = Internacional, 0 = Nacional',
  pais_destino          VARCHAR(100)           DEFAULT NULL COMMENT 'País (solo si es internacional)',

  -- Fechas del evento
  fecha_evento_inicio   DATE          NOT NULL COMMENT 'Inicio del evento',
  fecha_evento_fin      DATE                   DEFAULT NULL COMMENT 'Fin del evento (puede ser mismo día)',

  -- Fechas de estadía (pueden diferir del evento por viaje previo)
  fecha_salida          DATE          NOT NULL COMMENT 'Fecha de salida del diputado',
  fecha_regreso         DATE          NOT NULL COMMENT 'Fecha de regreso del diputado',

  -- Moneda y tipo de cambio
  moneda                ENUM('HNL','USD') NOT NULL DEFAULT 'HNL' COMMENT 'Moneda principal del registro',
  tasa_cambio           DECIMAL(10,4) NOT NULL DEFAULT 1.0000   COMMENT 'Tasa de cambio usada (solo aplica si moneda=USD)',

  -- Desglose de gastos (en la moneda seleccionada)
  hospedaje             DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Gasto en hospedaje',
  alimentacion          DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Gasto en alimentación',
  transporte            DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Gasto en transporte',
  otros                 DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Otros gastos varios',

  -- Estado del viático
  estado                ENUM('pendiente','aprobado','liquidado','rechazado')
                        NOT NULL DEFAULT 'pendiente',

  observaciones         TEXT                   DEFAULT NULL,

  -- Auditoría
  created_by            INT                    DEFAULT NULL,
  updated_by            INT                    DEFAULT NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_diputado   (diputado_id),
  KEY idx_estado     (estado),
  KEY idx_fecha_sal  (fecha_salida),
  KEY idx_moneda     (moneda),

  CONSTRAINT fk_vd_diputado  FOREIGN KEY (diputado_id) REFERENCES diputados  (id) ON UPDATE CASCADE,
  CONSTRAINT fk_vd_creado    FOREIGN KEY (created_by)  REFERENCES usuarios   (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_vd_actualiz  FOREIGN KEY (updated_by)  REFERENCES usuarios   (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registro de viáticos de diputados del Congreso Nacional';

-- Insertar el módulo en el sistema (ajustar orden según tu configuración)
INSERT IGNORE INTO modulos (clave, nombre, descripcion, activo, orden)
VALUES (
  'viaticos-diputados',
  'Viáticos Diputados',
  'Registro y control de viáticos (hospedaje, alimentación, transporte) de diputados propietarios y suplentes',
  1,
  (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos m2)
);
