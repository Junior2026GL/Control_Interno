const express      = require('express');
const router       = express.Router();
const ctrl         = require('../controllers/firma.controller');
const verifyToken  = require('../middleware/auth');
const audit        = require('../middleware/audit');

// POST /api/firma/imprimir  — genera PDF y registra impresión
router.post('/imprimir',  verifyToken, audit, ctrl.imprimir);

// GET  /api/firma/historial — lista historial de impresiones
router.get('/historial',  verifyToken, ctrl.historial);

module.exports = router;
