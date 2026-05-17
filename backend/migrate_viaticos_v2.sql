-- ═══════════════════════════════════════════════════════════════
-- Script de migración: Módulo Viáticos v2
-- Ejecutar manualmente en MySQL ANTES de reiniciar el servidor
-- ═══════════════════════════════════════════════════════════════

-- 1. Permitir periodo_dias decimal (ej: 3.5 días)
ALTER TABLE viaticos
  MODIFY COLUMN periodo_dias DECIMAL(4,1) NOT NULL DEFAULT 1.0;

-- 2. Agregar columna tipo en viaticos_dias para distinguir:
--    'viaje'   → días de viaje  (tabla RESUMEN en el PDF)
--    'estadia' → días de estadía (tabla DETALLE en el PDF)
ALTER TABLE viaticos_dias
  ADD COLUMN tipo ENUM('viaje','estadia') NOT NULL DEFAULT 'viaje'
  AFTER monto;

-- Nota: los registros existentes quedan con tipo='viaje' por el DEFAULT.
-- No se requiere UPDATE adicional.
