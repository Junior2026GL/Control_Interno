const db = require('../db');
const bcrypt = require('bcryptjs');

const ROLES_VALIDOS  = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];
const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

function sanitize(str) { return (str || '').trim(); }

function validateFields({ nombre, username, email, password, isCreate }) {
  if (!nombre || nombre.length < 2 || nombre.length > 100)
    return 'El nombre debe tener entre 2 y 100 caracteres.';
  if (!USERNAME_REGEX.test(username))
    return 'El username solo puede tener letras, números y guión bajo (3-30 caracteres).';
  if (!EMAIL_REGEX.test(email))
    return 'El correo electrónico no tiene un formato válido.';
  if (isCreate) {
    if (!password || password.length < 8)
      return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[A-Z]/.test(password))
      return 'La contraseña debe incluir al menos una letra mayúscula.';
    if (!/[0-9]/.test(password))
      return 'La contraseña debe incluir al menos un número.';
  }
  return null;
}

exports.getUsers = (req, res) => {
  db.query(
    `SELECT id, nombre, username, email, rol, activo,
      login_intentos,
      login_bloqueado_hasta,
      CASE WHEN login_bloqueado_hasta IS NOT NULL AND login_bloqueado_hasta > NOW() THEN 1 ELSE 0 END AS bloqueado
     FROM usuarios ORDER BY nombre ASC`,
    (err, results) => {
      if (err) { console.error('[users] Error en getUsers:', err); return res.status(500).json({ message: 'Error al obtener usuarios' }); }
      res.json(results);
    }
  );
};

exports.createUser = async (req, res) => {
  const nombre   = sanitize(req.body.nombre);
  const username = sanitize(req.body.username).toLowerCase();
  const email    = sanitize(req.body.email).toLowerCase();
  const password = req.body.password || '';
  const rol      = sanitize(req.body.rol);

  const err = validateFields({ nombre, username, email, password, isCreate: true });
  if (err) return res.status(400).json({ message: err });

  if (!ROLES_VALIDOS.includes(rol))
    return res.status(400).json({ message: 'Rol inválido.' });

  // Solo SUPER_ADMIN puede crear otros SUPER_ADMIN
  if (rol === 'SUPER_ADMIN' && req.user.rol !== 'SUPER_ADMIN')
    return res.status(403).json({ message: 'Solo el Super Administrador puede crear usuarios con ese rol.' });

  try {
    const hashed = await bcrypt.hash(password, 10);
    db.query(
      'INSERT INTO usuarios (nombre, username, email, password, rol) VALUES (?, ?, ?, ?, ?)',
      [nombre, username, email, hashed, rol],
      (dbErr) => {
        if (dbErr) {
          if (dbErr.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ message: 'El username o correo ya está en uso.' });
          console.error('[users] Error en createUser:', dbErr);
          return res.status(500).json({ message: 'Error al crear usuario.' });
        }
        res.status(201).json({ message: 'Usuario creado correctamente.' });
      }
    );
  } catch {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};

exports.updateUser = async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ message: 'ID inválido.' });

  const nombre   = sanitize(req.body.nombre);
  const username = sanitize(req.body.username).toLowerCase();
  const email    = sanitize(req.body.email).toLowerCase();
  const password = req.body.password || '';
  const rol      = sanitize(req.body.rol);
  const activo   = req.body.activo ?? 1;

  // Validate fields (password optional on edit)
  const fieldErr = validateFields({ nombre, username, email, password: password || 'Placeholder1', isCreate: false });
  if (fieldErr) return res.status(400).json({ message: fieldErr });

  if (rol && !ROLES_VALIDOS.includes(rol))
    return res.status(400).json({ message: 'Rol inválido.' });

  // Validate password if provided
  if (password.trim()) {
    if (password.length < 8)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
    if (!/[A-Z]/.test(password))
      return res.status(400).json({ message: 'La contraseña debe incluir al menos una letra mayúscula.' });
    if (!/[0-9]/.test(password))
      return res.status(400).json({ message: 'La contraseña debe incluir al menos un número.' });
  }

  // Non-SUPER_ADMIN cannot assign or touch SUPER_ADMIN role
  if (rol === 'SUPER_ADMIN' && req.user.rol !== 'SUPER_ADMIN')
    return res.status(403).json({ message: 'Solo el Super Administrador puede asignar ese rol.' });

  // Fetch target user to check current role
  db.query('SELECT rol FROM usuarios WHERE id = ?', [targetId], async (err, rows) => {
    if (err) { console.error('[users] Error en updateUser SELECT:', err); return res.status(500).json({ message: 'Error al verificar usuario.' }); }
    if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado.' });

    const targetRol = rows[0].rol;

    // ADMIN cannot modify a SUPER_ADMIN
    if (req.user.rol === 'ADMIN' && targetRol === 'SUPER_ADMIN')
      return res.status(403).json({ message: 'No tienes permiso para modificar a un Super Administrador.' });

    // Prevent demoting the last SUPER_ADMIN
    if (targetRol === 'SUPER_ADMIN' && rol !== 'SUPER_ADMIN') {
      db.query(
        'SELECT COUNT(*) AS total FROM usuarios WHERE rol = ? AND activo = 1',
        ['SUPER_ADMIN'],
        (cErr, cRows) => {
          if (cErr) { console.error('[users] Error en updateUser COUNT:', cErr); return res.status(500).json({ message: 'Error al verificar.' }); }
          if (cRows[0].total <= 1)
            return res.status(400).json({ message: 'No puedes cambiar el rol del único Super Administrador activo.' });
          doUpdate();
        }
      );
    } else {
      doUpdate();
    }

    async function doUpdate() {
      try {
        if (password.trim()) {
          const hashed = await bcrypt.hash(password, 10);
          db.query(
            'UPDATE usuarios SET nombre=?, username=?, email=?, password=?, rol=?, activo=? WHERE id=?',
            [nombre, username, email, hashed, rol, activo, targetId],
            (dbErr) => handleUpdateResult(dbErr, res)
          );
        } else {
          db.query(
            'UPDATE usuarios SET nombre=?, username=?, email=?, rol=?, activo=? WHERE id=?',
            [nombre, username, email, rol, activo, targetId],
            (dbErr) => handleUpdateResult(dbErr, res)
          );
        }
      } catch (err) {
        console.error('[users] Error en doUpdate:', err);
        res.status(500).json({ message: 'Error interno del servidor.' });
      }
    }
  });
};

function handleUpdateResult(err, res) {
  if (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'El username o correo ya está en uso.' });
    console.error('[users] Error en updateUser UPDATE:', err);
    return res.status(500).json({ message: 'Error al actualizar usuario.' });
  }
  res.json({ message: 'Usuario actualizado correctamente.' });
}

exports.deleteUser = (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ message: 'ID inválido.' });

  // No permitir desactivar al propio usuario
  if (targetId === req.user.id)
    return res.status(400).json({ message: 'No puedes desactivar tu propio usuario.' });

  // Prevenir desactivar el último SUPER_ADMIN activo
  db.query('SELECT rol FROM usuarios WHERE id = ?', [targetId], (err, rows) => {
    if (err) { console.error('[users] Error en deleteUser SELECT:', err); return res.status(500).json({ message: 'Error al verificar usuario.' }); }
    if (rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado.' });

    if (rows[0].rol === 'SUPER_ADMIN') {
      db.query(
        'SELECT COUNT(*) AS total FROM usuarios WHERE rol = ? AND activo = 1',
        ['SUPER_ADMIN'],
        (cErr, cRows) => {
          if (cErr) { console.error('[users] Error en deleteUser COUNT:', cErr); return res.status(500).json({ message: 'Error al verificar.' }); }
          if (cRows[0].total <= 1)
            return res.status(400).json({ message: 'No puedes desactivar el único Super Administrador activo.' });
          doDeactivate();
        }
      );
    } else {
      doDeactivate();
    }

    function doDeactivate() {
      db.query('UPDATE usuarios SET activo=0 WHERE id=?', [targetId], (dbErr) => {
        if (dbErr) { console.error('[users] Error en deleteUser deactivate:', dbErr); return res.status(500).json({ message: 'Error al desactivar usuario.' }); }
        res.json({ message: 'Usuario desactivado correctamente.' });
      });
    }
  });
};

// ── Desbloquear cuenta ───────────────────────────────────────
exports.unlockUser = (req, res) => {
  if (req.user.rol !== 'SUPER_ADMIN')
    return res.status(403).json({ message: 'Solo el Super Administrador puede desbloquear cuentas.' });

  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ message: 'ID inválido.' });

  db.query(
    'UPDATE usuarios SET login_intentos=0, login_bloqueado_hasta=NULL WHERE id=?',
    [targetId],
    (err, result) => {
      if (err) { console.error('[users] Error en unlockUser:', err); return res.status(500).json({ message: 'Error al desbloquear.' }); }
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Usuario no encontrado.' });
      res.json({ message: 'Cuenta desbloqueada correctamente.' });
    }
  );
};


