const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logEvent, getClientIP } = require('../middleware/audit');

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

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      logEvent({ accion: 'LOGIN_FAIL', modulo: 'auth', detalle: `Contraseña incorrecta para: ${username}`, ip, resultado: 'FALLO' });
      return res.status(INVALID.status).json({ message: INVALID.message });
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');

    db.query('UPDATE usuarios SET session_token = ? WHERE id = ?', [sessionToken, user.id], (updateErr) => {
      if (updateErr) {
        console.error('[auth] Error guardando session_token:', updateErr);
        return res.status(500).json({ message: 'Error en el servidor' });
      }

      const token = jwt.sign(
        { id: user.id, rol: user.rol, nombre: user.nombre, session_token: sessionToken },
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
  });
};