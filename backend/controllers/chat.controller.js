const https  = require('https');
const path   = require('path');
const db     = require('../db');

// Cargar dotenv con ruta absoluta por si el proceso arrancó desde otra carpeta
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { OpenAI } = require('openai');

let _openai = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── DB helper ────────────────────────────────────────────────────────────────
const query = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

// ── Build context: Presupuesto Social ────────────────────────────────────────
async function buildContext() {
  const anioActual = new Date().getFullYear();

  const [presupuestos, ayudas] = await Promise.all([
    query(`
      SELECT pd.id, pd.anio, pd.monto_asignado,
             d.nombre AS diputado, d.departamento, d.tipo AS tipo_diputado, d.partido,
             COALESCE(SUM(a.monto), 0) AS ejecutado,
             (pd.monto_asignado - COALESCE(SUM(a.monto), 0)) AS disponible
      FROM presupuesto_diputados pd
      JOIN diputados d ON d.id = pd.diputado_id
      LEFT JOIN ayudas_sociales a ON a.presupuesto_id = pd.id
      WHERE pd.anio >= ?
      GROUP BY pd.id
      ORDER BY pd.anio DESC, d.departamento ASC, d.nombre ASC
    `, [anioActual - 1]),
    query(`
      SELECT a.id, a.fecha, a.concepto, a.beneficiario,
             a.presupuesto_id,
             a.numero_orden, a.numero_cheque, a.monto,
             a.estado_liquidacion, a.fecha_liquidacion, a.observaciones,
             d.nombre AS diputado, d.departamento,
             uc.nombre AS creado_por,
             ul.nombre AS liquidado_por_nombre
      FROM ayudas_sociales a
      JOIN presupuesto_diputados pd ON pd.id = a.presupuesto_id
      JOIN diputados d ON d.id = pd.diputado_id
      LEFT JOIN usuarios uc ON uc.id = a.created_by
      LEFT JOIN usuarios ul ON ul.id = a.liquidado_por
      ORDER BY a.fecha DESC, a.id DESC
      LIMIT 400
    `),
  ]);

  const totalAsignado  = presupuestos.reduce((s, p) => s + parseFloat(p.monto_asignado), 0);
  const totalEjecutado = presupuestos.reduce((s, p) => s + parseFloat(p.ejecutado), 0);
  const sinLiquidar    = ayudas.filter(a => a.estado_liquidacion === 'sin_liquidar');
  const enProceso      = ayudas.filter(a => a.estado_liquidacion === 'en_proceso');
  const liquidadas     = ayudas.filter(a => a.estado_liquidacion === 'liquido');
  const montoSinLiq    = sinLiquidar.reduce((s, a) => s + parseFloat(a.monto), 0);

  // Conteos exactos por presupuesto (evita que la IA cuente incorrectamente)
  const conteos = {};
  ayudas.forEach(a => {
    const pid = a.presupuesto_id;
    if (!conteos[pid]) conteos[pid] = { total: 0, sin_liquidar: 0, en_proceso: 0, liquido: 0, monto_sin_liq: 0 };
    conteos[pid].total++;
    conteos[pid][a.estado_liquidacion] = (conteos[pid][a.estado_liquidacion] || 0) + 1;
    if (a.estado_liquidacion === 'sin_liquidar') conteos[pid].monto_sin_liq += parseFloat(a.monto);
  });

  const fmt      = n => `L${parseFloat(n).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtFecha = f => {
    if (!f) return '—';
    const d = new Date(f);
    return isNaN(d) ? String(f).slice(0, 10) : d.toLocaleDateString('es-GT');
  };
  const ESTADO = { sin_liquidar: 'SIN LIQUIDAR', en_proceso: 'EN PROCESO', liquido: 'LIQUIDADO' };

  let ctx = `=== SISTEMA PRESUPUESTO SOCIAL (${new Date().toLocaleDateString('es-GT')}) ===\n\n`;

  ctx += `--- RESUMEN GLOBAL ---\n`;
  ctx += `Presupuestos registrados : ${presupuestos.length}\n`;
  ctx += `Total asignado           : ${fmt(totalAsignado)}\n`;
  ctx += `Total ejecutado          : ${fmt(totalEjecutado)}\n`;
  ctx += `Total disponible         : ${fmt(totalAsignado - totalEjecutado)}\n`;
  ctx += `Ayudas registradas       : ${ayudas.length}\n`;
  ctx += `  Sin liquidar           : ${sinLiquidar.length}  (${fmt(montoSinLiq)})\n`;
  ctx += `  En proceso             : ${enProceso.length}\n`;
  ctx += `  Liquidadas             : ${liquidadas.length}\n\n`;

  ctx += `--- PRESUPUESTOS POR DIPUTADO ---\n`;
  presupuestos.forEach(p => {
    const pct = parseFloat(p.monto_asignado) > 0
      ? ((parseFloat(p.ejecutado) / parseFloat(p.monto_asignado)) * 100).toFixed(1)
      : '0.0';
    const c = conteos[p.id] || { total: 0, sin_liquidar: 0, en_proceso: 0, liquido: 0, monto_sin_liq: 0 };
    ctx += `[A\u00f1o ${p.anio}] ${p.diputado} | ${p.departamento} | ${p.tipo_diputado} | ${p.partido}\n`;
    ctx += `  Asignado: ${fmt(p.monto_asignado)} | Ejecutado: ${fmt(p.ejecutado)} | Disponible: ${fmt(p.disponible)} | Ejecuci\u00f3n: ${pct}%\n`;
    ctx += `  Ayudas: ${c.total} total | SIN LIQUIDAR: ${c.sin_liquidar} (${fmt(c.monto_sin_liq)}) | EN PROCESO: ${c.en_proceso} | LIQUIDADAS: ${c.liquido}\n`;
  });

  ctx += `\n--- REGISTRO DE AYUDAS (${ayudas.length} registros) ---\n`;
  ayudas.forEach(a => {
    ctx += `\n[#${a.id}] ${fmtFecha(a.fecha)} — ${a.diputado} (${a.departamento})\n`;
    ctx += `  Beneficiario  : ${a.beneficiario}\n`;
    ctx += `  Concepto      : ${a.concepto}\n`;
    ctx += `  Monto         : ${fmt(a.monto)}\n`;
    ctx += `  Nro. Orden    : ${a.numero_orden  || '—'}\n`;
    ctx += `  Nro. Cheque   : ${a.numero_cheque || '—'}\n`;
    ctx += `  Estado        : ${ESTADO[a.estado_liquidacion] || a.estado_liquidacion}\n`;
    if (a.estado_liquidacion === 'liquido')
      ctx += `  Liquidado el  : ${fmtFecha(a.fecha_liquidacion)} por ${a.liquidado_por_nombre || '—'}\n`;
    if (a.observaciones)
      ctx += `  Observaciones : ${a.observaciones}\n`;
    ctx += `  Registrado por: ${a.creado_por || '—'}\n`;
  });

  return ctx.trim();
}

// ── POST /api/chat/message ───────────────────────────────────────────────────
exports.sendMessage = async (req, res) => {
  const { mensaje, historial = [] } = req.body;

  if (!mensaje || typeof mensaje !== 'string' || mensaje.trim().length === 0)
    return res.status(400).json({ message: 'Mensaje requerido' });

  if (mensaje.trim().length > 600)
    return res.status(400).json({ message: 'Mensaje demasiado largo (max 600 caracteres)' });

  if (!Array.isArray(historial))
    return res.status(400).json({ message: 'Historial invalido' });

  try {
    const contexto = await buildContext();

    const systemPrompt = `Eres el asistente especializado del módulo de Presupuesto Social de la Pagaduría Especial. Tu única función es responder consultas sobre presupuestos asignados a diputados y el registro de ayudas sociales.

Estás hablando con ${req.user.nombre}. Dirígete siempre a él por su nombre.

REGLAS ESTRICTAS:
- Responde SIEMPRE en español.
- Usa formato L0.00 para montos (Lempiras hondureños).
- Sé preciso: cita los datos EXACTOS del contexto, sin redondear ni estimar.
- NUNCA inventes datos, montos, nombres o números que no estén en el contexto.
- Si el dato no existe en el contexto, dilo claramente.
- Al buscar por nombre, considera variaciones de mayúsculas/minúsculas.
- Para listar múltiples registros, usa formato de lista clara con los datos relevantes.
- Los estados de liquidación son: SIN LIQUIDAR, EN PROCESO, LIQUIDADO.
- Para calcular ejecución: (ejecutado / asignado) × 100.

${contexto}`;

    const safeMsgs = historial
      .slice(-10)
      .filter(h => h && typeof h.rol === 'string' && typeof h.contenido === 'string')
      .map(h => ({ role: h.rol === 'assistant' ? 'assistant' : 'user', content: h.contenido.slice(0, 600) }));

    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...safeMsgs,
        { role: 'user', content: mensaje.trim() },
      ],
      max_tokens: 1500,
      temperature: 0,
    });

    const respuesta = completion.choices[0].message.content;
    res.json({ respuesta });

  } catch (err) {
    console.error('[Chat] Error OpenAI:', err.status, err.message, err.code);
    res.status(500).json({ message: 'Error al procesar la consulta con IA' });
  }
};

// ── Convierte número entero a palabras en español ────────────────────────────
function numALetras(n) {
  if (n === 0) return 'cero';
  const nums = [
    '', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
    'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
    'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro',
    'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
  ];
  const decenas  = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const centenas = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
                    'seiscientos','setecientos','ochocientos','novecientos'];
  let r = '';
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000);
    r += m === 1 ? 'un millón' : numALetras(m) + ' millones';
    n %= 1000000; if (n) r += ' ';
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    r += k === 1 ? 'mil' : numALetras(k) + ' mil';
    n %= 1000; if (n) r += ' ';
  }
  if (n >= 100) {
    r += n === 100 ? 'cien' : centenas[Math.floor(n / 100)];
    n %= 100; if (n) r += ' ';
  }
  if (n >= 30) {
    r += decenas[Math.floor(n / 10)];
    n %= 10; if (n) r += ' y ' + nums[n];
  } else if (n > 0) {
    r += nums[n];
  }
  return r.trim();
}

// ── Limpia el texto para que ElevenLabs lo pronuncie correctamente ───────────
const DIGITO_ES = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];

function identidadAVoz(identidad) {
  // Normalizar: quitar espacios y guiones → 13 dígitos
  const d = identidad.replace(/[\s\-]/g, '');
  if (d.length !== 13 || !/^\d{13}$/.test(d)) return identidad;

  // Grupos: XXXX (4) + XXXX (4) + XXXXX (5)
  // Primer grupo (4 dígitos): leer por pares → 02,04
  // Segundo grupo (4 dígitos): leer por pares → 19,64
  // Tercer grupo (5 dígitos): primeros 3 dígito a dígito + par final → 000,61
  const g1 = d.slice(0, 4);   // ej. 0204
  const g2 = d.slice(4, 8);   // ej. 1964
  const g3 = d.slice(8, 13);  // ej. 00061

  function parAVoz(p) {
    // Si empieza con 0, leer "cero X" para preservar el cero inicial
    if (p[0] === '0') return DIGITO_ES[0] + ' ' + DIGITO_ES[parseInt(p[1], 10)];
    return numALetras(parseInt(p, 10));
  }
  function digitoAVoz(c) { return DIGITO_ES[parseInt(c, 10)]; }

  const parte1 = [g1.slice(0,2), g1.slice(2,4)].map(parAVoz).join(', ');
  const parte2 = [g2.slice(0,2), g2.slice(2,4)].map(parAVoz).join(', ');
  const parte3 = [g3[0], g3[1], g3[2]].map(digitoAVoz).join(', ')
               + ', ' + parAVoz(g3.slice(3,5));

  return parte1 + ', ' + parte2 + ', ' + parte3;
}

function prepararParaVoz(texto) {
  return texto
    // Quitar markdown primero
    .replace(/\*\*/g, '').replace(/\*/g, '')
    // Identidad hondureña: con separadores XXXX-XXXX-XXXXX / XXXX XXXX XXXXX
    .replace(/\b(\d{4})[\s\-](\d{4})[\s\-](\d{5})\b/g, (_, a, b, c) => identidadAVoz(a + b + c))
    // Identidad hondureña: 13 dígitos seguidos sin separadores
    .replace(/\b(\d{13})\b/g, (_, n) => identidadAVoz(n))
    // L1,234.56 → "mil doscientos treinta y cuatro lempiras con cincuenta y seis centavos"
    .replace(/L\s?([\d,]+)\.(\d{2})/g, (_, entero, centavos) => {
      const num = parseInt(entero.replace(/,/g, ''), 10);
      const cts = parseInt(centavos, 10);
      return cts === 0
        ? `${numALetras(num)} lempiras`
        : `${numALetras(num)} lempiras con ${numALetras(cts)} centavos`;
    })
    // "Etiqueta:" → "Etiqueta,"
    .replace(/:\s*/g, ', ')
    // Quitar guiones/bullets
    .replace(/^\s*[-•]\s*/gm, '')
    // Números solos de 4+ dígitos también en palabras
    .replace(/\b(\d{4,})\b/g, (_, n) => numALetras(parseInt(n, 10)))
    // Limpiar comas dobles y espacios extra
    .replace(/,\s*,/g, ',')
    .replace(/  +/g, ' ')
    .trim();
}

// ── POST /api/chat/tts ───────────────────────────────────────────────────────
exports.textToSpeech = (req, res) => {

  const { texto } = req.body;

  if (!texto || typeof texto !== 'string' || texto.trim().length === 0)
    return res.status(400).json({ message: 'Texto requerido' });

  if (texto.length > 1500)
    return res.status(400).json({ message: 'Texto demasiado largo (max 1500 caracteres)' });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
  const apiKey  = process.env.ELEVENLABS_API_KEY;

  if (!apiKey)
    return res.status(500).json({ message: 'ElevenLabs no configurado' });

  const textoVoz = prepararParaVoz(texto);

  const body = JSON.stringify({
    text: textoVoz,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: {
      stability: 0.35,
      similarity_boost: 0.85,
      style: 0.4,
      use_speaker_boost: true,
    },
  });

  const options = {
    hostname: 'api.elevenlabs.io',
    path: `/v1/text-to-speech/${voiceId}`,
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      'Content-Length': Buffer.byteLength(body),
    },
  };

  res.setHeader('Content-Type', 'audio/mpeg');

  const apiReq = https.request(options, (apiRes) => {
    if (apiRes.statusCode !== 200) {
      let errData = '';
      apiRes.on('data', d => { errData += d; });
      apiRes.on('end', () => {
        console.error('[TTS] ElevenLabs error:', apiRes.statusCode, errData);
        if (!res.headersSent)
          res.status(502).json({ message: 'Error de ElevenLabs al generar audio' });
      });
      return;
    }
    apiRes.pipe(res);
  });

  apiReq.on('error', (err) => {
    console.error('[TTS] Request error:', err.message);
    if (!res.headersSent)
      res.status(500).json({ message: 'Error al conectar con ElevenLabs' });
  });

  apiReq.write(body);
  apiReq.end();
};
