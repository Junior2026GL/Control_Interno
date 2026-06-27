'use strict';

/**
 * Convierte un número a su representación en letras en español (mayúsculas).
 * Orientado a montos en Lempiras (Honduras).
 *
 * Ejemplos:
 *   200000    → "DOSCIENTOS MIL LEMPIRAS EXACTOS"
 *   49500.50  → "CUARENTA Y NUEVE MIL QUINIENTOS LEMPIRAS CON 50/100 CENTAVOS"
 *   1         → "UN LEMPIRA EXACTO"
 */

const UNIDADES = [
  '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
];

const DECENAS = [
  '', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA',
  'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA',
];

const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
];

/**
 * Convierte un número entero menor a 1000 a palabras.
 * @param {number} n - Entero entre 0 y 999
 * @returns {string}
 */
function cientos(n) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';

  const c = Math.floor(n / 100);
  const resto = n % 100;

  const centena = c > 0 ? CENTENAS[c] : '';
  const decena = decenas(resto);

  if (centena && decena) return `${centena} ${decena}`;
  return centena || decena;
}

/**
 * Convierte un número menor a 100 a palabras.
 * @param {number} n - Entero entre 0 y 99
 * @returns {string}
 */
function decenas(n) {
  if (n === 0) return '';
  if (n < 20) return UNIDADES[n];
  if (n === 20) return 'VEINTE';

  const d = Math.floor(n / 10);
  const u = n % 10;

  // Veintiuno, veintidós... (21-29 se escriben junto)
  if (d === 2 && u > 0) {
    const veintiUnidades = [
      '', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO',
      'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
    ];
    return veintiUnidades[u];
  }

  const decena = DECENAS[d];
  if (u === 0) return decena;
  return `${decena} Y ${UNIDADES[u]}`;
}

/**
 * Convierte un número entero a palabras (soporta hasta 999.999.999).
 * @param {number} n - Entero no negativo
 * @returns {string}
 */
function enteroPalabras(n) {
  if (n === 0) return 'CERO';

  if (n < 1000) return cientos(n);

  if (n < 1000000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const prefijo = miles === 1 ? 'MIL' : `${cientos(miles)} MIL`;
    const sufijo  = cientos(resto);
    return sufijo ? `${prefijo} ${sufijo}` : prefijo;
  }

  if (n < 1000000000) {
    const millones = Math.floor(n / 1000000);
    const resto    = n % 1000000;
    const prefijo  = millones === 1
      ? 'UN MILLÓN'
      : `${cientos(millones)} MILLONES`;
    const sufijo   = enteroPalabras(resto);
    return sufijo && sufijo !== 'CERO' ? `${prefijo} ${sufijo}` : prefijo;
  }

  return 'NÚMERO FUERA DE RANGO';
}

/**
 * Convierte un monto decimal a letras en español para moneda hondureña.
 *
 * @param {number|string} monto - Monto numérico (máx. 999,999,999.99)
 * @returns {string} - Ej: "DOSCIENTOS MIL LEMPIRAS EXACTOS"
 */
function montoALetras(monto) {
  const valor = parseFloat(monto);
  if (isNaN(valor) || valor < 0) return 'MONTO INVÁLIDO';
  if (valor > 999999999.99) return 'MONTO FUERA DE RANGO';

  // Separar entero y centavos usando redondeo seguro
  const entero    = Math.floor(valor);
  const centavos  = Math.round((valor - entero) * 100);

  const letrasEntero = enteroPalabras(entero);

  // Singular / plural de "Lempira"
  const lempiras = entero === 1 ? 'LEMPIRA' : 'LEMPIRAS';

  if (centavos === 0) {
    const exacto = entero === 1 ? 'EXACTO' : 'EXACTOS';
    return `${letrasEntero} ${lempiras} ${exacto}`;
  }

  const centStr = centavos.toString().padStart(2, '0');
  return `${letrasEntero} ${lempiras} CON ${centStr}/100 CENTAVOS`;
}

module.exports = { montoALetras };
