const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/auth');

router.get('/', verifyToken, (req, res) => {
  db.query('SELECT * FROM caja_chica ORDER BY fecha DESC', (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

router.post('/', verifyToken, (req, res) => {
  const { fecha, descripcion, tipo, monto } = req.body;

  db.query(
    'INSERT INTO caja_chica (fecha, descripcion, tipo, monto, usuario_id) VALUES (?, ?, ?, ?, ?)',
    [fecha, descripcion, tipo, monto, req.user.id],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Movimiento registrado' });
    }
  );
});

router.get('/saldo', verifyToken, (req, res) => {
  db.query(
    `SELECT 
      SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE 0 END) -
      SUM(CASE WHEN tipo='EGRESO' THEN monto ELSE 0 END) 
     AS saldo FROM caja_chica`,
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results[0]);
    }
  );
});

module.exports = router;