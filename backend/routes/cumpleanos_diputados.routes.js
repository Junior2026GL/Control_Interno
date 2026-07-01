const express     = require('express');
const router      = express.Router();
const verifyToken = require('../middleware/auth');
const checkRole   = require('../middleware/role');
const ctrl        = require('../controllers/cumpleanos_diputados.controller');

const rolesPermitidos = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];

// GET /api/cumpleanos-diputados/stats
router.get('/stats', verifyToken, checkRole(rolesPermitidos), ctrl.getStats);

// GET /api/cumpleanos-diputados
router.get('/', verifyToken, checkRole(rolesPermitidos), ctrl.getAll);

module.exports = router;
