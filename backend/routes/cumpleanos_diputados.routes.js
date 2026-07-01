const express     = require('express');
const router      = express.Router();
const verifyToken = require('../middleware/auth');
const ctrl        = require('../controllers/cumpleanos_diputados.controller');

// GET /api/cumpleanos-diputados — cualquier usuario autenticado con acceso al módulo
router.get('/', verifyToken, ctrl.getAll);

module.exports = router;
