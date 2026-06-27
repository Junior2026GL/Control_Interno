-- ═══════════════════════════════════════════════════════════════════════════════
--  MÓDULO: ÓRDENES DE PAGO
--  Sistema de Control Interno — Congreso Nacional de Honduras
--  Migración v1.0 — 2026-06-26
--  Ejecutar directamente en MySQL antes de reiniciar el servidor.
-- ═══════════════════════════════════════════════════════════════════════════════

USE control_interno;

-- ── 1. Tabla principal de órdenes de pago ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordenes_pago (
  id                       INT           AUTO_INCREMENT PRIMARY KEY,

  -- Número correlativo del documento (se asigna al aprobar)
  -- Formato: 341/AS/2026  |  ej. AS = Ayuda Social, OP = Manual
  numero_orden             VARCHAR(30)   NULL        COMMENT 'Ej: 341/AS/2026',
  numero_secuencial        SMALLINT UNSIGNED NULL    COMMENT 'Parte numérica del correlativo',
  sufijo_orden             VARCHAR(10)   NOT NULL DEFAULT 'OP'
                           COMMENT 'AS=Ayuda Social  OP=Manual',

  -- Tipo de origen y referencia
  tipo_origen              ENUM('AYUDA_DIPUTADO','MANUAL') NOT NULL DEFAULT 'MANUAL',
  ayuda_social_id          INT           NULL
                           COMMENT 'Referencia a ayudas_sociales.id (sin FK — soft reference)',

  -- ── Datos del beneficiario (snapshot al momento de crear) ────────────────
  beneficiario             VARCHAR(250)  NOT NULL,
  codigo_beneficiario      VARCHAR(60)   NULL    COMMENT 'DNI, RTN o identidad',

  -- ── Monto ────────────────────────────────────────────────────────────────
  monto                    DECIMAL(15,2) NOT NULL,
  monto_letras             VARCHAR(500)  NOT NULL,

  -- ── Forma de pago ────────────────────────────────────────────────────────
  forma_pago               ENUM('CHEQUE','TRANSFERENCIA') NOT NULL DEFAULT 'TRANSFERENCIA',
  no_cheque_transferencia  VARCHAR(60)   NULL,
  tipo_cuenta              ENUM('CORRIENTE','CAPITAL','D_PUB') NOT NULL DEFAULT 'CORRIENTE',

  -- ── Código contable — Tabla CARGOS (fila principal del preimpreso) ───────
  cargo_anio               SMALLINT UNSIGNED NULL,
  cargo_org                VARCHAR(10)   NULL,
  cargo_fondo              VARCHAR(10)   NULL,
  cargo_tipo_prog          VARCHAR(10)   NULL,
  cargo_sub_prog           VARCHAR(10)   NULL,
  cargo_act                VARCHAR(10)   NULL,
  cargo_cuenta             VARCHAR(20)   NULL  COMMENT 'Ej: 513-00',

  -- ── Descripción del documento ────────────────────────────────────────────
  valor_adeuda_por         VARCHAR(300)  NULL,
  concepto                 VARCHAR(500)  NOT NULL,
  descripcion_detallada    TEXT          NULL,

  -- ── Fecha del documento ──────────────────────────────────────────────────
  fecha                    DATE          NOT NULL,

  -- ── Ciclo de vida ────────────────────────────────────────────────────────
  estado                   ENUM('BORRADOR','APROBADA','IMPRESA','ENTREGADA','ANULADA')
                           NOT NULL DEFAULT 'BORRADOR',

  -- ── Trazabilidad — creación ──────────────────────────────────────────────
  created_by               INT           NOT NULL,
  created_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,

  -- ── Trazabilidad — aprobación ────────────────────────────────────────────
  aprobado_por             INT           NULL,
  fecha_aprobacion         DATETIME      NULL,

  -- ── Trazabilidad — anulación ─────────────────────────────────────────────
  anulado_por              INT           NULL,
  fecha_anulacion          DATETIME      NULL,
  motivo_anulacion         VARCHAR(500)  NULL,

  -- ── Observaciones internas ───────────────────────────────────────────────
  observaciones            VARCHAR(500)  NULL,

  -- ── Índices ──────────────────────────────────────────────────────────────
  INDEX idx_op_estado          (estado),
  INDEX idx_op_tipo_origen     (tipo_origen),
  INDEX idx_op_ayuda_social    (ayuda_social_id),
  INDEX idx_op_fecha           (fecha),
  INDEX idx_op_numero_orden    (numero_orden),
  INDEX idx_op_created_by      (created_by),
  INDEX idx_op_sufijo_anio     (sufijo_orden, cargo_anio),
  INDEX idx_op_beneficiario    (beneficiario(60)),

  -- ── Integridad referencial con usuarios ──────────────────────────────────
  CONSTRAINT fk_op_created_by   FOREIGN KEY (created_by)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_op_aprobado_por FOREIGN KEY (aprobado_por)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_op_anulado_por  FOREIGN KEY (anulado_por)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Órdenes de pago — datos congelados al aprobar';


-- ── 2. Secuencia de numeración por año y sufijo ───────────────────────────────
--      Garantiza correlativos únicos sin condiciones de carrera
CREATE TABLE IF NOT EXISTS ordenes_pago_secuencia (
  anio          YEAR        NOT NULL,
  sufijo        VARCHAR(10) NOT NULL,
  ultimo_numero SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (anio, sufijo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Contador de correlativo por año y tipo de orden';

-- Inicializar con el año actual
INSERT IGNORE INTO ordenes_pago_secuencia (anio, sufijo, ultimo_numero) VALUES
  (YEAR(CURDATE()), 'AS', 0),
  (YEAR(CURDATE()), 'OP', 0);


-- ── 3. Historial de impresiones ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordenes_pago_impresiones (
  id                  INT        AUTO_INCREMENT PRIMARY KEY,
  orden_id            INT        NOT NULL,
  impreso_por         INT        NOT NULL,
  fecha_impresion     DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  es_reimpresion      TINYINT(1) NOT NULL DEFAULT 0,
  motivo_reimpresion  VARCHAR(300) NULL,
  ip_cliente          VARCHAR(45)  NULL,

  INDEX idx_opi_orden   (orden_id),
  INDEX idx_opi_usuario (impreso_por),
  INDEX idx_opi_fecha   (fecha_impresion),

  CONSTRAINT fk_opi_orden   FOREIGN KEY (orden_id)
    REFERENCES ordenes_pago(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_opi_usuario FOREIGN KEY (impreso_por)
    REFERENCES usuarios(id)    ON DELETE RESTRICT ON UPDATE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registro de cada impresión y reimpresión de una orden de pago';


-- ── 4. Registrar módulo en el sistema ─────────────────────────────────────────
INSERT IGNORE INTO modulos (clave, nombre)
VALUES ('ordenes-pago', 'Órdenes de Pago');

-- Asignar módulo automáticamente al SUPER_ADMIN
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'ordenes-pago';


-- ── 5. Verificación final ─────────────────────────────────────────────────────
SELECT
  TABLE_NAME      AS tabla,
  TABLE_COMMENT   AS descripcion
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('ordenes_pago', 'ordenes_pago_secuencia', 'ordenes_pago_impresiones')
ORDER BY TABLE_NAME;

SELECT CONCAT('Módulo registrado: ', clave, ' — ', nombre) AS resultado
FROM modulos WHERE clave = 'ordenes-pago';
