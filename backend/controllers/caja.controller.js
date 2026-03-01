const db = require('../db');

exports.getMovimientos = (req, res) => {
  db.query(
    'SELECT * FROM caja_chica ORDER BY fecha DESC',
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
};

exports.createMovimiento = (req, res) => {
  const { fecha, descripcion, tipo, monto } = req.body;

  db.query(
    'INSERT INTO caja_chica (fecha, descripcion, tipo, monto, usuario_id) VALUES (?, ?, ?, ?, ?)',
    [fecha, descripcion, tipo, monto, req.user.id],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'Movimiento registrado correctamente' });
    }
  );
};

exports.getSaldo = (req, res) => {
  db.query(
    `SELECT 
      IFNULL(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE 0 END),0) -
      IFNULL(SUM(CASE WHEN tipo='EGRESO' THEN monto ELSE 0 END),0) 
     AS saldo 
     FROM caja_chica`,
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results[0]);
    }
  );
};