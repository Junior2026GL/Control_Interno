const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/role');

router.get('/', verifyToken, (req, res) => {
  db.query('SELECT id, nombre, email, rol, activo FROM usuarios', (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

router.post('/', verifyToken, checkRole(['ADMIN']), async (req, res) => {
  const { nombre, email, password, rol } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
    [nombre, email, hashedPassword, rol],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Usuario creado' });
    }
  );
});

router.put('/:id', verifyToken, (req, res) => {
  const { nombre, email, rol, activo } = req.body;

  db.query(
    'UPDATE usuarios SET nombre=?, email=?, rol=?, activo=? WHERE id=?',
    [nombre, email, rol, activo, req.params.id],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Usuario actualizado' });
    }
  );
});

router.delete('/:id', verifyToken, checkRole(['ADMIN']), (req, res) => {
  db.query(
    'UPDATE usuarios SET activo=0 WHERE id=?',
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Usuario desactivado' });
    }
  );
});

module.exports = router;