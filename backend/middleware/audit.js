/**
 * Módulo de Auditoría.
 *
 * Exporta:
 *   - logEvent(data)     → registra un evento manualmente (fire-and-forget)
 *   - auditMiddleware    → middleware Express que registra automáticamente
 *                          todas las mutaciones (POST, PUT, PATCH, DELETE)
 */

const db     = require('../db');
const geoip  = require('geoip-lite');

function normalizeIP(ip) {
  if (!ip) return 'desconocida';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function getClientIP(req) {
  // En Railway/proxies: X-Forwarded-For contiene la IP real del cliente
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Puede ser "clientIP, proxy1, proxy2" — tomamos la primera
    const first = forwarded.split(',')[0].trim();
    if (first) return normalizeIP(first);
  }
  return normalizeIP(req.ip || req.socket?.remoteAddress);
}

// Resuelve país (código ISO-2) y ciudad a partir de la IP usando base de datos local
function getGeo(ip) {
  try {
    const geo = geoip.lookup(ip);
    if (!geo) return { pais: null, ciudad: null };
    const pais = geo.country || null;
    // Prioridad: city → timezone city → null
    let ciudad = (geo.city && geo.city.trim()) || null;
    if (!ciudad && geo.timezone) {
      // "America/Tegucigalpa" → "Tegucigalpa" | "America/New_York" → "New York"
      const parts = geo.timezone.split('/');
      if (parts.length >= 2) {
        ciudad = parts[parts.length - 1].replace(/_/g, ' ');
      }
    }
    return { pais, ciudad };
  } catch {
    return { pais: null, ciudad: null };
  }
}

/**
 * Registra un evento de auditoría. Fire-and-forget, no bloquea la respuesta.
 * @param {object} data
 * @param {number|null}  data.usuario_id
 * @param {string|null}  data.usuario_nombre
 * @param {string}       data.accion          - LOGIN_OK | LOGIN_FAIL | CREAR | ACTUALIZAR | ELIMINAR | IP_BLOQUEADA | ACCESO_DENEGADO
 * @param {string|null}  data.modulo
 * @param {string|null}  data.detalle
 * @param {string}       data.ip
 * @param {string|null}  data.metodo
 * @param {string|null}  data.ruta
 * @param {string}       data.resultado       - EXITO | FALLO | BLOQUEADO
 */
function logEvent({
  usuario_id     = null,
  usuario_nombre = null,
  accion,
  modulo         = null,
  detalle        = null,
  ip,
  metodo         = null,
  ruta           = null,
  resultado      = 'EXITO',
}) {
  const cleanIP = normalizeIP(ip);
  const { pais, ciudad } = getGeo(cleanIP);
  db.query(
    `INSERT INTO auditoria
       (usuario_id, usuario_nombre, accion, modulo, detalle, ip, pais, ciudad, metodo, ruta, resultado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [usuario_id, usuario_nombre, accion, modulo, detalle, cleanIP, pais, ciudad, metodo, ruta, resultado],
    (err) => {
      if (err) console.error('[AUDIT] Error registrando evento:', err.message);
    }
  );
}

/**
 * Middleware automático: registra POST / PUT / PATCH / DELETE al completar.
 * No registra el módulo de auditoría mismo para evitar ruido.
 * Fire-and-forget para evitar bloqueos en caso de fallos de BD.
 */
const auditMiddleware = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  res.on('finish', () => {
    try {
      const ruta   = req.originalUrl || '';
      const modulo = ruta.split('/')[2] || null; // /api/[modulo]/...

      // No auto-loguear auditoría ni auth (auth ya registra LOGIN_OK/LOGIN_FAIL manualmente)
      if (modulo === 'auditoria' || modulo === 'auth') return;

      const status    = res.statusCode;
      const resultado = status >= 200 && status < 300 ? 'EXITO' : 'FALLO';

      let accion;
      switch (req.method) {
        case 'POST':   accion = 'CREAR';       break;
        case 'PUT':
        case 'PATCH':  accion = 'ACTUALIZAR';  break;
        case 'DELETE': accion = 'ELIMINAR';    break;
        default:       accion = req.method;
      }

      logEvent({
        usuario_id:     req.user?.id     || null,
        usuario_nombre: req.user?.nombre || null,
        accion,
        modulo,
        ip:      getClientIP(req),
        metodo:  req.method,
        ruta,
        resultado,
      });
    } catch (err) {
      console.error('[AUDIT] Error en auditMiddleware:', err.message);
      // No bloquear la respuesta en caso de error
    }
  });

  next();
};

module.exports = auditMiddleware;
module.exports.logEvent     = logEvent;
module.exports.normalizeIP  = normalizeIP;
module.exports.getClientIP  = getClientIP;
module.exports.normalizeIP  = normalizeIP;
