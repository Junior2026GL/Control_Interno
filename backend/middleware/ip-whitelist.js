/**
 * Middleware de lista blanca de IPs.
 * Lee las IPs autorizadas desde la tabla `ip_whitelist` de la BD.
 * Si la tabla está vacía (whitelist desactivada), permite todo el acceso.
 *
 * Fallback: si la BD falla, usa ALLOWED_IPS del .env (separadas por coma).
 * Soporta IPs exactas y rangos CIDR (ej. 192.168.1.0/24).
 * Loopback (127.0.0.1, ::1) siempre está permitido.
 */

const db = require('../db');

// ── Cache en memoria ──────────────────────────────────────────
let _cache    = null;   // null = no cargado, [] = whitelist vacía (pass-all), [...] = lista activa
let _cacheAt  = 0;
const CACHE_TTL = 60_000; // 60 segundos

function loadFromDB() {
  return new Promise((resolve) => {
    db.query(
      'SELECT ip FROM ip_whitelist WHERE activo = 1',
      (err, rows) => {
        if (err) {
          console.error('[IP-WHITELIST] Error leyendo BD, usando fallback .env:', err.message);
          // fallback: leer del .env
          const raw = (process.env.ALLOWED_IPS || '').trim();
          const list = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
          resolve(list);
        } else {
          resolve(rows.map(r => r.ip.trim()));
        }
      }
    );
  });
}

async function getList() {
  if (_cache !== null && (Date.now() - _cacheAt) < CACHE_TTL) return _cache;
  _cache   = await loadFromDB();
  _cacheAt = Date.now();
  return _cache;
}

/** Invalida el cache inmediatamente (llamar tras modificar la tabla). */
function invalidateCache() {
  _cache  = null;
  _cacheAt = 0;
}

// ── Utilitarios IP ────────────────────────────────────────────
// Usa req.ip que respeta el setting 'trust proxy' de Express.
// TRUST_PROXY=0 (local) → req.ip = socket address
// TRUST_PROXY=1 (servidor) → req.ip = IP real del cliente vía X-Forwarded-For
function normalizeIP(ip) {
  if (ip && ip.startsWith('::ffff:')) return ip.slice(7);
  return ip || '';
}

function ipToUint32(ip) {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

function isInCIDR(ip, cidr) {
  const [range, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipToUint32(ip) & mask) === (ipToUint32(range) & mask);
}

function isIPv4(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

function isAllowed(ip, allowedList) {
  for (const entry of allowedList) {
    if (entry.includes('/')) {
      if (isIPv4(ip) && isInCIDR(ip, entry)) return true;
    } else if (entry === ip) {
      return true;
    }
  }
  return false;
}

// ── Middleware ────────────────────────────────────────────────
const ipWhitelist = async (req, res, next) => {
  const list = await getList();

  // Lista vacía → whitelist desactivada, acceso libre
  if (list.length === 0) return next();

  const clientIP = normalizeIP(req.ip);

  // Loopback siempre permitido
  if (clientIP === '127.0.0.1' || clientIP === '::1') return next();

  if (!isAllowed(clientIP, list)) {
    console.warn(`[IP-WHITELIST] Bloqueado — IP: ${clientIP} | ${req.method} ${req.path}`);

    // Registrar en auditoría (lazy require para evitar dependencia circular)
    try {
      const { logEvent } = require('./audit');
      logEvent({
        accion:    'IP_BLOQUEADA',
        modulo:    'ip-whitelist',
        detalle:   `${req.method} ${req.originalUrl}`,
        ip:        clientIP,
        metodo:    req.method,
        ruta:      req.originalUrl,
        resultado: 'BLOQUEADO',
      });
    } catch (_) {}

    return res.status(403).json({ message: 'Acceso denegado: su IP no está autorizada para acceder a este sistema.' });
  }

  next();
};

module.exports = ipWhitelist;
module.exports.invalidateCache = invalidateCache;

