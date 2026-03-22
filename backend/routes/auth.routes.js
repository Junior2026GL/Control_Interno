const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
  }

  db.query('SELECT * FROM usuarios WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).json(err);
    if (results.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

    const user = results[0];

    if (!user.activo) {
      return res.status(403).json({ message: 'Usuario desactivado' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ message: 'Contraseña incorrecta' });

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ 
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        rol: user.rol
      }
    });
  });
});

// ── Forgot password: verify username + email, return short-lived reset token ──
router.post('/forgot-password', (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) {
    return res.status(400).json({ message: 'Usuario y correo son requeridos' });
  }

  db.query(
    'SELECT id, nombre, email FROM usuarios WHERE username = ? AND activo = 1',
    [username],
    (err, results) => {
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
      res.json({ message: 'Identidad verificada', resetToken, nombre: user.nombre });
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