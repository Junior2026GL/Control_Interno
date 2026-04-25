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

// ── Build context from DB ────────────────────────────────────────────────────
async function buildContext() {
  const [cajaRes, movimientos, autorizaciones, usuarios, diputados, presupuestos, ayudas, ayudasRegistro] = await Promise.all([
    query(`
      SELECT
        SUM(CASE WHEN tipo IN ('RECARGA','INGRESO') THEN monto ELSE 0 END) AS ingresos,
        SUM(CASE WHEN tipo = 'EGRESO' THEN monto ELSE 0 END) AS egresos
      FROM caja_chica
    `),
    query(`
      SELECT cc.fecha, cc.descripcion, cc.tipo, cc.monto, cc.categoria,
             u.nombre AS usuario
      FROM caja_chica cc
      JOIN usuarios u ON u.id = cc.usuario_id
      ORDER BY cc.fecha DESC
      LIMIT 100
    `),
    query(`
      SELECT ap.numero, ap.tipo_pago, ap.beneficiario, ap.monto,
             ap.detalle, ap.estado, ap.fecha_creacion, ap.fecha_autorizacion,
             ap.motivo_rechazo, ap.firma_nombre,
             c.nombre AS creado_por, a.nombre AS autorizado_por
      FROM autorizaciones_pago ap
      LEFT JOIN usuarios c ON c.id = ap.creado_por
      LEFT JOIN usuarios a ON a.id = ap.autorizado_por
      ORDER BY ap.fecha_creacion DESC
      LIMIT 100
    `),
    query(`SELECT nombre, username, email, rol, activo FROM usuarios ORDER BY nombre`),
    query(`
      SELECT id, departamento, numero, tipo, nombre, identidad, partido, telefono, correo
      FROM diputados
      ORDER BY departamento ASC, numero ASC, nombre ASC
      LIMIT 500
    `),
    query(`
      SELECT pd.id, pd.anio, pd.monto_asignado, pd.observaciones, pd.created_at,
             d.nombre AS diputado_nombre, d.departamento, d.tipo AS diputado_tipo, d.partido,
             COALESCE(SUM(a.monto), 0) AS ejecutado,
             (pd.monto_asignado - COALESCE(SUM(a.monto), 0)) AS disponible
      FROM presupuesto_diputados pd
      JOIN diputados d ON d.id = pd.diputado_id
      LEFT JOIN ayudas_sociales a ON a.presupuesto_id = pd.id
      GROUP BY pd.id
      ORDER BY pd.anio DESC, d.departamento ASC, d.nombre ASC
      LIMIT 500
    `),
    query(`
      SELECT a.id, a.fecha, a.concepto, a.beneficiario, a.monto, a.observaciones,
             a.created_at, d.nombre AS diputado_nombre, d.departamento,
             u.nombre AS registrado_por
      FROM ayudas_sociales a
      JOIN presupuesto_diputados pd ON pd.id = a.presupuesto_id
      JOIN diputados d ON d.id = pd.diputado_id
      LEFT JOIN usuarios u ON u.id = a.created_by
      ORDER BY a.fecha DESC, a.id DESC
      LIMIT 500
    `),
    query(`
      SELECT a.id, a.nombre_completo, a.dni, a.rtn, a.fecha,
             a.cantidad, a.tipo_ayuda, a.observaciones,
             u.nombre AS registrado_por
      FROM ayudas a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      ORDER BY a.fecha DESC, a.id DESC
      LIMIT 500
    `),
  ]);

  const ingresos = parseFloat(cajaRes[0].ingresos) || 0;
  const egresos  = parseFloat(cajaRes[0].egresos)  || 0;
  const saldo    = ingresos - egresos;

  const totalPresupuestado = presupuestos.reduce((s, p) => s + parseFloat(p.monto_asignado), 0);
  const totalEjecutado     = presupuestos.reduce((s, p) => s + parseFloat(p.ejecutado), 0);
  const totalDisponible    = totalPresupuestado - totalEjecutado;

  const totalAyudas      = ayudasRegistro.length;
  const montoTotalAyudas = ayudasRegistro.reduce((s, a) => s + parseFloat(a.cantidad || 0), 0);

  return `
=== DATOS REALES DEL SISTEMA (${new Date().toLocaleDateString('es-GT')}) ===

--- CAJA CHICA ---
Saldo actual: L${saldo.toFixed(2)}
Total ingresos/recargas: L${ingresos.toFixed(2)}
Total egresos: L${egresos.toFixed(2)}
Ultimos 100 movimientos: ${JSON.stringify(movimientos)}

--- AUTORIZACIONES DE PAGO (ultimas 100) ---
${JSON.stringify(autorizaciones)}

--- USUARIOS DEL SISTEMA ---
${JSON.stringify(usuarios)}

--- DIPUTADOS (${diputados.length} registros) ---
${JSON.stringify(diputados)}

--- PRESUPUESTO DE DIPUTADOS (${presupuestos.length} registros) ---
Total presupuestado: L${totalPresupuestado.toFixed(2)}
Total ejecutado: L${totalEjecutado.toFixed(2)}
Total disponible: L${totalDisponible.toFixed(2)}
Detalle por diputado/año: ${JSON.stringify(presupuestos)}

--- AYUDAS SOCIALES (ultimas 500) ---
${JSON.stringify(ayudas)}

--- REGISTRO DE AYUDAS - Pagaduria Especial (ultimas 500) ---
Total registros: ${totalAyudas}
Monto total entregado: L${montoTotalAyudas.toFixed(2)}
Detalle: ${JSON.stringify(ayudasRegistro)}
`.trim();
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

    const systemPrompt = `Eres el asistente de inteligencia artificial del sistema de la Pagaduría Especial. Tienes acceso a los datos reales y actualizados del sistema. Tu rol es responder preguntas con datos precisos y concretos.

Estás hablando con ${req.user.nombre}. Dirígete a él por su nombre en cada respuesta.

Reglas:
- Siempre responde en español.
- Usa formato L0.00 para montos (Lempiras hondureños).
- Se conciso pero completo.
- Si el dato no esta en el contexto, dilo claramente.
- No inventes datos ni valores.
- Puedes hacer calculos con los datos que tienes.
- Puedes consultar y responder sobre diputados: nombre, departamento, tipo (PROPIETARIO/SUPLENTE), partido, identidad, telefono y correo.
- Puedes consultar y responder sobre el presupuesto de diputados: monto asignado, ejecutado, disponible por diputado y año.
- Puedes consultar ayudas sociales registradas: beneficiario, concepto, monto, fecha y diputado al que pertenecen.
- Puedes consultar y responder sobre el REGISTRO DE AYUDAS de la Pagaduría Especial: beneficiario (nombre_completo), DNI, RTN, fecha, cantidad, tipo de ayuda y observaciones. Puedes filtrar por tipo (Económica, Médica, Alimentaria, Educativa, Material/Especie, Social, Otra), por rango de fechas, y calcular totales por tipo o período.
- Para calcular porcentajes de ejecucion usa: (ejecutado / monto_asignado) * 100.

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
      max_tokens: 700,
      temperature: 0.2,
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
