const db = require('../db');
const bcrypt = require('bcryptjs');

const ROLES_VALIDOS = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];

exports.getUsers = (req, res) => {
  db.query(
    'SELECT id, nombre, username, email, rol, activo FROM usuarios',
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
};

exports.createUser = async (req, res) => {
  const { nombre, username, email, password, rol } = req.body;

  if (!nombre || !username || !email || !password || !rol) {
    return res.status(400).json({ message: 'Todos los campos son requeridos' });
  }

  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ message: 'Rol inválido' });
  }

  // Solo SUPER_ADMIN puede crear otros SUPER_ADMIN
  if (rol === 'SUPER_ADMIN' && req.user.rol !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Solo el Super Administrador puede crear usuarios con ese rol' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    'INSERT INTO usuarios (nombre, username, email, password, rol) VALUES (?, ?, ?, ?, ?)',
    [nombre, username, email, hashedPassword, rol],
    (err) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ message: 'El username o email ya está en uso' });
        }
        return res.status(500).json(err);
      }
      res.json({ message: 'Usuario creado correctamente' });
    }
  );
};

exports.updateUser = (req, res) => {
  const { nombre, username, email, rol, activo } = req.body;

  if (rol && !ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ message: 'Rol inválido' });
  }

  // Evitar que un no-SUPER_ADMIN promueva o modifique a un SUPER_ADMIN
  if (rol === 'SUPER_ADMIN' && req.user.rol !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Solo el Super Administrador puede asignar ese rol' });
  }

  db.query(
    'UPDATE usuarios SET nombre=?, username=?, email=?, rol=?, activo=? WHERE id=?',
    [nombre, username, email, rol, activo, req.params.id],
    (err) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ message: 'El username o email ya está en uso' });
        }
        return res.status(500).json(err);
      }
      res.json({ message: 'Usuario actualizado correctamente' });
    }
  );
};

exports.deleteUser = (req, res) => {
  // No permitir desactivar al propio usuario
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ message: 'No puedes desactivar tu propio usuario' });
  }

  db.query(
    'UPDATE usuarios SET activo=0 WHERE id=?',
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Usuario desactivado correctamente' });
    }
  );
};