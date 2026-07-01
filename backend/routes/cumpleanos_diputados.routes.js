const express     = require('express');
const router      = express.Router();
const verifyToken = require('../middleware/auth');
const ctrl        = require('../controllers/cumpleanos_diputados.controller');

// GET /api/cumpleanos-diputados/stats
router.get('/stats', verifyToken, ctrl.getStats);

// GET /api/cumpleanos-diputados
router.get('/', verifyToken, ctrl.getAll);

module.exports = router;
