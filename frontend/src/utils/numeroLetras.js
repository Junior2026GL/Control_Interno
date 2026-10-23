/* Número a letras (Lempiras) */
function enteroALetras(n) {
  if (n === 0) return 'CERO';
  if (n < 0)  return 'MENOS ' + enteroALetras(-n);
  const U = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
    'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE',
    'DIECIOCHO','DIECINUEVE','VEINTE','VEINTIUN','VEINTIDOS','VEINTITRES',
    'VEINTICUATRO','VEINTICINCO','VEINTISEIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
  const D = ['','DIEZ','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const C = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
    'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  if (n === 100) return 'CIEN';
  if (n < 30)    return U[n];
  if (n < 100) { const dec = Math.floor(n / 10), uni = n % 10; return uni === 0 ? D[dec] : D[dec] + ' Y ' + U[uni]; }
  if (n < 1000) { const cen = Math.floor(n / 100), r = n % 100; return r === 0 ? C[cen] : C[cen] + ' ' + enteroALetras(r); }
  if (n < 1000000) {
    const mil = Math.floor(n / 1000), r = n % 1000;
    const pre = mil === 1 ? 'MIL' : enteroALetras(mil) + ' MIL';
    return r === 0 ? pre : pre + ' ' + enteroALetras(r);
  }
  const mill = Math.floor(n / 1000000), r = n % 1000000;
  const pre = mill === 1 ? 'UN MILLON' : enteroALetras(mill) + ' MILLONES';
  return r === 0 ? pre : pre + ' ' + enteroALetras(r);
}

export function numeroALetras(monto) {
  const total = Math.round(parseFloat(monto || 0) * 100);
  const lempiras = Math.floor(total / 100);
  const centavos = total % 100;
  const base = enteroALetras(lempiras);
  return centavos === 0
    ? `${base} LEMPIRAS EXACTOS`
    : `${base} LEMPIRAS CON ${String(centavos).padStart(2, '0')}/100 CENTAVOS`;
}
