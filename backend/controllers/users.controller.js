const db = require('../db');
const bcrypt = require('bcryptjs');

exports.getUsers = (req, res) => {
  db.query(
    'SELECT id, nombre, email, rol, activo FROM usuarios',
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
};

exports.createUser = async (req, res) => {
  const { nombre, email, password, rol } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
    [nombre, email, hashedPassword, rol],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Usuario creado correctamente' });
    }
  );
};

exports.updateUser = (req, res) => {
  const { nombre, email, rol, activo } = req.body;

  db.query(
    'UPDATE usuarios SET nombre=?, email=?, rol=?, activo=? WHERE id=?',
    [nombre, email, rol, activo, req.params.id],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Usuario actualizado correctamente' });
    }
  );
};

exports.deleteUser = (req, res) => {
  db.query(
    'UPDATE usuarios SET activo=0 WHERE id=?',
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Usuario desactivado correctamente' });
    }
  );
};