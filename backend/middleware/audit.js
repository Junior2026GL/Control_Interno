/**
 * Módulo de Auditoría.
 *
 * Exporta:
 *   - logEvent(data)     → registra un evento manualmente (fire-and-forget)
 *   - auditMiddleware    → middleware Express que registra automáticamente
 *                          todas las mutaciones (POST, PUT, PATCH, DELETE)
 */

const db = require('../db');

function normalizeIP(ip) {
  if (!ip) return 'desconocida';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
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
  db.query(
    `INSERT INTO auditoria
       (usuario_id, usuario_nombre, accion, modulo, detalle, ip, metodo, ruta, resultado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [usuario_id, usuario_nombre, accion, modulo, detalle, normalizeIP(ip), metodo, ruta, resultado],
    (err) => {
      if (err) console.error('[AUDIT] Error registrando evento:', err.message);
    }
  );
}

/**
 * Middleware automático: registra POST / PUT / PATCH / DELETE al completar.
 * No registra el módulo de auditoría mismo para evitar ruido.
 */
const auditMiddleware = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  res.on('finish', () => {
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
      ip:      req.ip,
      metodo:  req.method,
      ruta,
      resultado,
    });
  });

  next();
};

module.exports = auditMiddleware;
module.exports.logEvent     = logEvent;
module.exports.normalizeIP  = normalizeIP;
