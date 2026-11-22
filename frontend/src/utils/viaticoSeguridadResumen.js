/* Resumen de gastos del recibo de Viáticos (tabla editable).
   Cada fila: { descripcion, monto, auto }
   auto: 'ah' = hospedaje + alimentación, 'a' = alimentación, 'h' = hospedaje, null = monto manual */

const num = v => parseFloat(v) || 0;

export const SUGERENCIAS = [
  { texto: 'COMBUSTIBLE',              auto: null },
  { texto: 'KILOMETRAJE',              auto: null },
  { texto: 'PEAJES',                   auto: null },
  { texto: 'IMPREVISTOS',              auto: null },
];

/* Filas del resumen de un recibo guardado. Los recibos anteriores (sin resumen guardado)
   se convierten: hospedaje y alimentación, combustible, imprevistos y otros. */
export function resumenDeRegistro(rec) {
  if (Array.isArray(rec.detalle_resumen) && rec.detalle_resumen.length) {
    return rec.detalle_resumen.map(r => ({
      descripcion: r.descripcion || '',
      monto: num(r.monto),
      auto: r.auto || null,
    }));
  }
  const filas = [];
  const ah = num(rec.monto_hospedaje) + num(rec.monto_alimentacion);
  if (ah > 0) filas.push({ descripcion: 'HOSPEDAJE Y ALIMENTACION', monto: ah, auto: 'ah' });

  const comb = Array.isArray(rec.detalle_combustible) ? rec.detalle_combustible : [];
  const items = comb.filter(r => (r.detalle || r.nombre) || num(r.monto) > 0);
  if (items.length) {
    items.forEach(r => filas.push({ descripcion: r.detalle || r.nombre || 'COMBUSTIBLE', monto: num(r.monto), auto: null }));
  } else if (num(rec.monto_combustible) > 0) {
    filas.push({ descripcion: 'COMBUSTIBLE', monto: num(rec.monto_combustible), auto: null });
  }
  if (num(rec.monto_imprevistos) > 0) filas.push({ descripcion: 'IMPREVISTOS', monto: num(rec.monto_imprevistos), auto: null });
  if (num(rec.monto_otros) > 0) filas.push({ descripcion: rec.otros_descripcion || 'OTROS', monto: num(rec.monto_otros), auto: null });
  return filas;
}
