/**
 * Migración: redistribuir presupuestos automáticos existentes
 * 
 * Los presupuestos con tipo_distribucion='auto' creados antes del fix
 * tienen todos los 12 meses con el mismo valor (distribución por /12).
 * Este script los redistribuye correctamente desde MONTH(created_at) a diciembre.
 * 
 * Uso: node migrate_presupuesto_auto_meses.js
 */

require('dotenv').config();
const db = require('./db');

async function migrar() {
  const conn = await db.promise().getConnection();
  try {
    // Obtener todos los presupuestos automáticos
    const [presupuestos] = await conn.query(
      `SELECT id, monto_asignado, MONTH(created_at) AS mes_inicio
       FROM presupuesto_diputados
       WHERE tipo_distribucion = 'auto'`
    );

    console.log(`Presupuestos automáticos encontrados: ${presupuestos.length}`);
    let corregidos = 0;

    for (const pres of presupuestos) {
      const [mesesRows] = await conn.query(
        `SELECT mes, monto_asignado FROM presupuesto_mensual
         WHERE presupuesto_id = ? ORDER BY mes`,
        [pres.id]
      );

      // Saltar si no tiene 12 meses (datos incompletos)
      if (mesesRows.length !== 12) {
        console.log(`  ID ${pres.id}: solo tiene ${mesesRows.length} meses, omitido.`);
        continue;
      }

      // Verificar si todos los meses tienen monto > 0 (distribución vieja /12)
      const allNonZero = mesesRows.every(r => parseFloat(r.monto_asignado) > 0);
      if (!allNonZero) {
        console.log(`  ID ${pres.id}: ya tiene ceros en meses anteriores, omitido.`);
        continue;
      }

      // Redistribuir desde mes_inicio hasta diciembre
      const mesInicio = pres.mes_inicio;
      const monto     = parseFloat(pres.monto_asignado);
      const numMeses  = Math.max(1, 13 - mesInicio);
      const base      = Math.floor((monto / numMeses) * 100) / 100;
      const remainder = +(monto - base * (numMeses - 1)).toFixed(2);

      const monthlyRows = Array.from({ length: 12 }, (_, i) => {
        const mesNum = i + 1;
        const montoMes = mesNum < mesInicio ? 0 : (mesNum === 12 ? remainder : base);
        return [pres.id, mesNum, montoMes];
      });

      await conn.query('DELETE FROM presupuesto_mensual WHERE presupuesto_id = ?', [pres.id]);
      await conn.query(
        'INSERT INTO presupuesto_mensual (presupuesto_id, mes, monto_asignado) VALUES ?',
        [monthlyRows]
      );

      console.log(`  ID ${pres.id}: mes_inicio=${mesInicio}, L ${monto.toFixed(2)} → ${numMeses} meses de L ${base.toFixed(2)} c/u`);
      corregidos++;
    }

    console.log(`\nMigración completa. ${corregidos} presupuesto(s) corregido(s).`);
  } catch (err) {
    console.error('Error en migración:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrar();
