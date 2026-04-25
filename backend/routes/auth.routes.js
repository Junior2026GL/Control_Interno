const express    = require('express');
const router     = express.Router();
const rateLimit  = require('express-rate-limit');
const db         = require('../db');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
  }

  db.query('SELECT * FROM usuarios WHERE username = ?', [username], async (err, results) => {
    if (err) {
      console.error('[auth] Error en login DB:', err);
      return res.status(500).json({ message: 'Error en el servidor' });
    }

    // Misma respuesta y código para usuario inexistente y contraseña incorrecta
    // (evita enumeración de usuarios)
    const INVALID = { status: 401, message: 'Credenciales inválidas' };

    if (results.length === 0) return res.status(INVALID.status).json({ message: INVALID.message });

    const user = results[0];

    if (!user.activo) {
      return res.status(403).json({ message: 'Usuario desactivado' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(INVALID.status).json({ message: INVALID.message });

    const token = jwt.sign(
      { id: user.id, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    db.query(
      'SELECT m.clave FROM modulos m JOIN usuario_modulos um ON m.id = um.modulo_id WHERE um.usuario_id = ?',
      [user.id],
      (err2, modResults) => {
        // Si las tablas aún no existen, devolver login igualmente sin módulos
        const modulos = err2 ? [] : modResults.map(r => r.clave);
        res.json({
          token,
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