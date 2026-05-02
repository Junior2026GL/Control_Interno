const jwt = require('jsonwebtoken');
const db  = require('../db');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) return res.status(401).json({ message: 'Token requerido' });

  try {
    const decoded = jwt.verify(token.split(' ')[1], process.env.JWT_SECRET);
    req.user = decoded;

    // Verificar sesión única activa
    db.query('SELECT session_token FROM usuarios WHERE id = ?', [decoded.id], (err, rows) => {
      if (err || rows.length === 0)
        return res.status(401).json({ message: 'Token inválido' });

      if (rows[0].session_token !== decoded.session_token)
        return res.status(401).json({ message: 'Sesión cerrada en otro dispositivo', code: 'SESSION_REPLACED' });

      next();
    });
  } catch {
    res.status(401).json({ message: 'Token inválido' });
  }
};

module.exports = verifyToken;