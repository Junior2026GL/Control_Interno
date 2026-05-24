-- ============================================================
--  Migración: Distribución mensual de Presupuesto Social
--  Fecha     : 2026-05-23
--  Requiere  : MySQL 8.0+ / MariaDB 10.3+
--
--  INSTRUCCIONES:
--    1. Ejecutar este script UNA sola vez en producción
--       ANTES de desplegar el nuevo código del backend/frontend.
--    2. No afecta datos existentes (solo agrega columna y tabla).
-- ============================================================

USE control_interno;

-- ─────────────────────────────────────────────────────────────
-- 1. Nueva columna en presupuesto_diputados
--    'auto'         = anual ÷ 12  (distribución uniforme)
--    'personalizada' = el usuario distribuyó mes a mes
-- ─────────────────────────────────────────────────────────────
ALTER TABLE presupuesto_diputados
  ADD COLUMN tipo_distribucion
    ENUM('auto','personalizada') NOT NULL DEFAULT 'auto'
  AFTER monto_asignado;

-- ─────────────────────────────────────────────────────────────
-- 2. Tabla de cuotas mensuales
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presupuesto_mensual (
  id               INT            AUTO_INCREMENT PRIMARY KEY,
  presupuesto_id   INT            NOT NULL,
  mes              TINYINT        NOT NULL COMMENT '1 = Enero … 12 = Diciembre',
  monto_asignado   DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  UNIQUE KEY uq_pres_mes (presupuesto_id, mes),
  CONSTRAINT fk_pm_presupuesto
    FOREIGN KEY (presupuesto_id)
    REFERENCES presupuesto_diputados(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 3. Generar distribución automática para presupuestos YA
--    existentes (divide el anual entre 12; el centavo sobrante
--    queda en diciembre para que la suma sea exacta).
--    INSERT IGNORE: seguro si se re-ejecuta el script.
-- ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO presupuesto_mensual (presupuesto_id, mes, monto_asignado)
SELECT
  pd.id,
  meses_t.mes,
  CASE
    WHEN meses_t.mes < 12
      THEN FLOOR(pd.monto_asignado / 12 * 100) / 100
    ELSE
      ROUND(
        pd.monto_asignado
        - (FLOOR(pd.monto_asignado / 12 * 100) / 100 * 11),
        2
      )
  END
FROM presupuesto_diputados pd
CROSS JOIN (
  SELECT  1 AS mes UNION ALL SELECT  2 UNION ALL SELECT  3 UNION ALL
  SELECT  4          UNION ALL SELECT  5 UNION ALL SELECT  6 UNION ALL
  SELECT  7          UNION ALL SELECT  8 UNION ALL SELECT  9 UNION ALL
  SELECT 10          UNION ALL SELECT 11 UNION ALL SELECT 12
) AS meses_t;
