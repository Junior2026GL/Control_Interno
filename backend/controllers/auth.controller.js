const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logEvent, getClientIP } = require('../middleware/audit');

const MAX_INTENTOS  = 3;
const BLOQUEO_MIN   = 15;

exports.login = (req, res) => {
  const { username, password } = req.body;
  const ip = getClientIP(req);

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
  }

  db.query('SELECT * FROM usuarios WHERE username = ?', [username], async (err, results) => {
    if (err) {
      console.error('[auth] Error en login DB:', err);
      return res.status(500).json({ message: 'Error en el servidor' });
    }

    const INVALID = { status: 401, message: 'Credenciales inválidas' };

    if (results.length === 0) {
      logEvent({ accion: 'LOGIN_FAIL', modulo: 'auth', detalle: `Usuario no encontrado: ${username}`, ip, resultado: 'FALLO' });
      return res.status(INVALID.status).json({ message: INVALID.message });
    }

    const user = results[0];

    if (!user.activo) {
      logEvent({ accion: 'LOGIN_FAIL', modulo: 'auth', detalle: `Usuario desactivado: ${username}`, ip, resultado: 'FALLO' });
      return res.status(403).json({ message: 'Usuario desactivado' });
    }

    // ── Verificar bloqueo ──────────────────────────────────────
    if (user.login_bloqueado_hasta) {
      const bloqueadoHasta = new Date(user.login_bloqueado_hasta);
      const ahora = new Date();
      if (ahora < bloqueadoHasta) {
        const minRestantes = Math.ceil((bloqueadoHasta - ahora) / 60000);
        logEvent({ usuario_id: user.id, usuario_nombre: user.nombre, accion: 'LOGIN_FAIL', modulo: 'auth', detalle: `Cuenta bloqueada: ${username}`, ip, resultado: 'FALLO' });
        return res.status(423).json({
          message: `Cuenta bloqueada por demasiados intentos fallidos. Intente en ${minRestantes} minuto${minRestantes !== 1 ? 's' : ''}.`,
          bloqueado: true,
          minRestantes,
        });
      }
      // Bloqueo expirado → resetear
      db.query('UPDATE usuarios SET login_intentos=0, login_bloqueado_hasta=NULL WHERE id=?', [user.id]);
      user.login_intentos = 0;
      user.login_bloqueado_hasta = null;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      const nuevosIntentos = (user.login_intentos || 0) + 1;

      if (nuevosIntentos >= MAX_INTENTOS) {
        const bloqueadoHasta = new Date(Date.now() + BLOQUEO_MIN * 60 * 1000);
        db.query('UPDATE usuarios SET login_intentos=?, login_bloqueado_hasta=? WHERE id=?',
          [nuevosIntentos, bloqueadoHasta, user.id]);
        logEvent({ usuario_id: user.id, usuario_nombre: user.nombre, accion: 'LOGIN_BLOQUEADO', modulo: 'auth', detalle: `Cuenta bloqueada tras ${MAX_INTENTOS} intentos fallidos`, ip, resultado: 'FALLO' });
        return res.status(423).json({
          message: `Cuenta bloqueada por ${BLOQUEO_MIN} minutos tras ${MAX_INTENTOS} intentos fallidos.`,
          bloqueado: true,
          minRestantes: BLOQUEO_MIN,
        });
      }

      db.query('UPDATE usuarios SET login_intentos=? WHERE id=?', [nuevosIntentos, user.id]);
      const restantes = MAX_INTENTOS - nuevosIntentos;
      logEvent({ usuario_id: user.id, usuario_nombre: user.nombre, accion: 'LOGIN_FAIL', modulo: 'auth', detalle: `Contraseña incorrecta para: ${username} (intento ${nuevosIntentos}/${MAX_INTENTOS})`, ip, resultado: 'FALLO' });
      return res.status(401).json({
        message: `Credenciales inválidas. ${restantes === 1 ? 'Te queda 1 intento antes de bloquear la cuenta.' : `Te quedan ${restantes} intentos.`}`,
      });
    }

    // ── Login exitoso → resetear intentos ─────────────────────
    db.query('UPDATE usuarios SET login_intentos=0, login_bloqueado_hasta=NULL WHERE id=?', [user.id]);

    const token = jwt.sign(
      { id: user.id, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    logEvent({ usuario_id: user.id, usuario_nombre: user.nombre, accion: 'LOGIN_OK', modulo: 'auth', ip, resultado: 'EXITO' });

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        rol: user.rol
      }
    });
  });
};