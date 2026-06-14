const express    = require('express');
const router     = express.Router();
const rateLimit  = require('express-rate-limit');
const db         = require('../db');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { logEvent, getClientIP } = require('../middleware/audit');

const MAX_INTENTOS = 3;
const BLOQUEO_MIN  = 15;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.' },
});

router.post('/login', loginLimiter, (req, res) => {
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

    if (results.length === 0) {
      logEvent({ accion: 'LOGIN_FAIL', modulo: 'auth', detalle: `Usuario no encontrado: ${username}`, ip, resultado: 'FALLO' });
      return res.status(401).json({ message: 'Credenciales inválidas' });
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
        logEvent({ usuario_id: user.id, usuario_nombre: user.nombre, accion: 'LOGIN_BLOQUEADO', modulo: 'auth', detalle: `Cuenta bloqueada: ${username}`, ip, resultado: 'FALLO' });
        return res.status(423).json({
          message: `Cuenta bloqueada por demasiados intentos fallidos. Intente en ${minRestantes} minuto${minRestantes !== 1 ? 's' : ''}.`,
          bloqueado: true,
          minRestantes,
        });
      }
      // Bloqueo expirado → resetear
      db.query('UPDATE usuarios SET login_intentos=0, login_bloqueado_hasta=NULL WHERE id=?', [user.id], () => {});
      user.login_intentos = 0;
      user.login_bloqueado_hasta = null;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      const nuevosIntentos = (user.login_intentos || 0) + 1;

      if (nuevosIntentos >= MAX_INTENTOS) {
        const bloqueadoHasta = new Date(Date.now() + BLOQUEO_MIN * 60 * 1000);
        db.query(
          'UPDATE usuarios SET login_intentos=?, login_bloqueado_hasta=? WHERE id=?',
          [nuevosIntentos, bloqueadoHasta, user.id],
          (e) => { if (e) console.error('[auth] Error al bloquear cuenta:', e); }
        );
        logEvent({ usuario_id: user.id, usuario_nombre: user.nombre, accion: 'LOGIN_BLOQUEADO', modulo: 'auth', detalle: `Cuenta bloqueada tras ${MAX_INTENTOS} intentos fallidos`, ip, resultado: 'FALLO' });
        return res.status(423).json({
          message: `Cuenta bloqueada por ${BLOQUEO_MIN} minutos tras ${MAX_INTENTOS} intentos fallidos.`,
          bloqueado: true,
          minRestantes: BLOQUEO_MIN,
        });
      }

      db.query(
        'UPDATE usuarios SET login_intentos=? WHERE id=?',
        [nuevosIntentos, user.id],
        (e) => { if (e) console.error('[auth] Error al actualizar intentos:', e); }
      );
      const restantes = MAX_INTENTOS - nuevosIntentos;
      logEvent({ usuario_id: user.id, usuario_nombre: user.nombre, accion: 'LOGIN_FAIL', modulo: 'auth', detalle: `Contraseña incorrecta (intento ${nuevosIntentos}/${MAX_INTENTOS})`, ip, resultado: 'FALLO' });
      return res.status(401).json({
        message: `Credenciales inválidas. ${restantes === 1 ? 'Te queda 1 intento antes de bloquear la cuenta.' : `Te quedan ${restantes} intentos.`}`,
      });
    }

    // ── Login exitoso → resetear intentos ─────────────────────
    db.query('UPDATE usuarios SET login_intentos=0, login_bloqueado_hasta=NULL WHERE id=?', [user.id], () => {});

    // Access token: 15 min
    const accessToken = jwt.sign(
      { id: user.id, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Refresh token: 12 horas (token opaco almacenado en BD)
    const crypto = require('crypto');
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    // Revocar refresh tokens anteriores de este usuario (un token activo por sesión)
    db.query('UPDATE refresh_tokens SET revoked=1 WHERE usuario_id=? AND revoked=0', [user.id]);
    db.query(
      'INSERT INTO refresh_tokens (usuario_id, token, expires_at, ip) VALUES (?, ?, ?, ?)',
      [user.id, refreshToken, expiresAt, ip],
      (rtErr) => { if (rtErr) console.error('[auth] Error guardando refresh token:', rtErr); }
    );

    logEvent({ usuario_id: user.id, usuario_nombre: user.nombre, accion: 'LOGIN_OK', modulo: 'auth', ip, resultado: 'EXITO' });

    db.query(
      'SELECT m.clave FROM modulos m JOIN usuario_modulos um ON m.id = um.modulo_id WHERE um.usuario_id = ?',
      [user.id],
      (err2, modResults) => {
        const modulos = err2 ? [] : modResults.map(r => r.clave);
        res.json({
          token: accessToken,
          refreshToken,
          user: {
            id: user.id,
            nombre: user.nombre,
            rol: user.rol,
            modulos,
          }
        });
      }
    );
  });
});

// ── Refresh token: emite nuevo access token si el refresh es válido ──────────
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token requerido' });
  }

  db.query(
    `SELECT rt.*, u.rol, u.nombre, u.activo
     FROM refresh_tokens rt
     JOIN usuarios u ON u.id = rt.usuario_id
     WHERE rt.token = ? AND rt.revoked = 0`,
    [refreshToken],
    (err, rows) => {
      if (err) return res.status(500).json({ message: 'Error en el servidor' });
      if (rows.length === 0) {
        return res.status(401).json({ message: 'Refresh token inválido o revocado' });
      }

      const rt = rows[0];

      if (!rt.activo) {
        return res.status(403).json({ message: 'Usuario desactivado' });
      }

      if (new Date() > new Date(rt.expires_at)) {
        db.query('UPDATE refresh_tokens SET revoked=1 WHERE id=?', [rt.id]);
        return res.status(401).json({ message: 'Refresh token expirado. Inicie sesión nuevamente.' });
      }

      // Rotar refresh token: revocar el actual y emitir uno nuevo
      const crypto = require('crypto');
      const newRefreshToken = crypto.randomBytes(64).toString('hex');
      const newExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      db.query('UPDATE refresh_tokens SET revoked=1 WHERE id=?', [rt.id], (e) => {
        if (e) { console.error('[auth] Error revocando refresh token:', e); return res.status(500).json({ message: 'Error en el servidor' }); }

        db.query(
          'INSERT INTO refresh_tokens (usuario_id, token, expires_at) VALUES (?, ?, ?)',
          [rt.usuario_id, newRefreshToken, newExpiresAt],
          (e2) => {
            if (e2) { console.error('[auth] Error guardando nuevo refresh token:', e2); return res.status(500).json({ message: 'Error en el servidor' }); }

            const newAccessToken = jwt.sign(
              { id: rt.usuario_id, rol: rt.rol, nombre: rt.nombre },
              process.env.JWT_SECRET,
              { expiresIn: '15m' }
            );

            res.json({ token: newAccessToken, refreshToken: newRefreshToken });
          }
        );
      });
    }
  );
});

// ── Logout: revocar refresh token ────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    db.query('UPDATE refresh_tokens SET revoked=1 WHERE token=?', [refreshToken],
      (e) => { if (e) console.error('[auth] Error revocando refresh token en logout:', e); }
    );
  }
  res.json({ message: 'Sesión cerrada' });
});

// ── Forgot password: verify username + email, send reset link by email ────────
const mailer = require('../config/mailer');

router.post('/forgot-password', (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) {
    return res.status(400).json({ message: 'Usuario y correo son requeridos' });
  }

  db.query(
    'SELECT id, nombre, email FROM usuarios WHERE username = ? AND activo = 1',
    [username],
    async (err, results) => {
      if (err) return res.status(500).json({ message: 'Error en el servidor' });
      if (results.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado o inactivo' });
      }
      const user = results[0];
      // Compare email case-insensitively
      if (user.email.toLowerCase() !== email.trim().toLowerCase()) {
        return res.status(401).json({ message: 'El correo no coincide con el usuario' });
      }
      // Issue a short-lived reset token scoped to password reset only
      const resetToken = jwt.sign(
        { id: user.id, scope: 'password_reset' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      try {
        await mailer.sendPasswordReset(user.email, user.nombre, resetUrl);
        res.json({ message: 'Se ha enviado un enlace de recuperación a tu correo electrónico.' });
      } catch (mailErr) {
        console.error('[forgot-password] Error al enviar correo:', mailErr);
        res.status(500).json({ message: 'No se pudo enviar el correo. Intenta de nuevo más tarde.' });
      }
    }
  );
});

// ── Reset password: validate reset token, hash and save new password ──────────
router.post('/reset-password', async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return res.status(400).json({ message: 'Token y nueva contraseña son requeridos' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
  }

  let decoded;
  try {
    decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'El enlace de recuperación expiró o es inválido' });
  }

  if (decoded.scope !== 'password_reset') {
    return res.status(401).json({ message: 'Token no válido para este propósito' });
  }

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    db.query(
      'UPDATE usuarios SET password = ? WHERE id = ?',
      [hashed, decoded.id],
      (err, result) => {
        if (err) return res.status(500).json({ message: 'Error al actualizar contraseña' });
        if (result.affectedRows === 0) {
          return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        res.json({ message: 'Contraseña actualizada exitosamente' });
      }
    );
  } catch {
    res.status(500).json({ message: 'Error al procesar la contraseña' });
  }
});

module.exports = router;