-- ══════════════════════════════════════════════════════════════
--  Módulo: Retiro de Bodegas
--  Tabla:  retiro_bodegas
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS retiro_bodegas (
  id                INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  diputado_id       INT          NULL COMMENT 'FK a tabla diputados (opcional si se borra diputado)',
  diputado_nombre   VARCHAR(200) NOT NULL COMMENT 'Nombre del diputado (desnormalizado)',
  departamento      VARCHAR(100) NOT NULL,
  partido           VARCHAR(150) NULL,
  persona_retiro    VARCHAR(200) NOT NULL COMMENT 'Persona que retiró en las bodegas',
  fecha_entrega     DATE         NOT NULL,
  cantidad_recibida INT          NOT NULL,
  numero_orden      VARCHAR(30)  NOT NULL,
  observaciones     VARCHAR(500) NULL,
  usuario_id        INT          NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rb_diputado FOREIGN KEY (diputado_id) REFERENCES diputados(id) ON DELETE SET NULL,
  CONSTRAINT fk_rb_usuario  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
