/**
 * Migración: Proveedores — columnas cuenta_proveedor y tipos_pago
 *
 * Separa los datos que estaban mezclados en la columna `rp` (VARCHAR 50)
 * en dos columnas dedicadas con significado claro.
 *
 * Ejecutar UNA sola vez:
 *   node backend/migrate_proveedores_pago.js
 */

const db = require('./db');

async function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

async function run() {
  console.log('=== Migración proveedores: cuenta_proveedor + tipos_pago ===\n');

  // 1. Agregar columnas nuevas si no existen
  const alters = [
    `ALTER TABLE proveedores ADD COLUMN cuenta_proveedor VARCHAR(150) NULL COMMENT 'Número de cuenta bancaria del proveedor'`,
    `ALTER TABLE proveedores ADD COLUMN tipos_pago       VARCHAR(300) NULL COMMENT 'Tipos de pago aceptados, separados por coma'`,
  ];

  for (const sql of alters) {
    try {
      await query(sql);
      const col = sql.match(/ADD COLUMN (\w+)/)[1];
      console.log(`✔ Columna '${col}' agregada.`);
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        const col = sql.match(/ADD COLUMN (\w+)/)[1];
        console.log(`  Columna '${col}' ya existe, omitiendo.`);
      } else {
        throw err;
      }
    }
  }

  // 2. Leer registros que tienen datos en rp
  const rows = await query(`SELECT id, rp FROM proveedores WHERE rp IS NOT NULL AND rp != ''`);
  console.log(`\nRegistros a migrar: ${rows.length}`);

  let migrados = 0;
  let omitidos = 0;

  for (const row of rows) {
    let cuenta = null;
    let tipos  = null;

    try {
      const parsed = JSON.parse(row.rp);
      if (parsed && typeof parsed === 'object' && ('tipos_pago' in parsed || 'cuenta' in parsed)) {
        // Dato nuevo en formato JSON
        cuenta = parsed.cuenta?.trim() || null;
        tipos  = Array.isArray(parsed.tipos_pago) && parsed.tipos_pago.length
          ? parsed.tipos_pago.join(',')
          : null;
      } else {
        // No es el JSON esperado, omitir
        omitidos++;
        continue;
      }
    } catch {
      // Es un string plano (dato viejo — solo cuenta)
      cuenta = row.rp.trim() || null;
    }

    await query(
      `UPDATE proveedores SET cuenta_proveedor = ?, tipos_pago = ?, rp = NULL WHERE id = ?`,
      [cuenta, tipos, row.id]
    );
    migrados++;
  }

  console.log(`✔ Migrados: ${migrados} | Omitidos (formato desconocido): ${omitidos}`);
  console.log('\nMigración completada.');
  process.exit(0);
}

run().catch(err => {
  console.error('Error en la migración:', err);
  process.exit(1);
});
