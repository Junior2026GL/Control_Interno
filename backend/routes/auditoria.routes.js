const express     = require('express');
const router      = express.Router();
const verifyToken = require('../middleware/auth');
const checkRole   = require('../middleware/role');
const ctrl        = require('../controllers/auditoria.controller');

// Solo SUPER_ADMIN puede acceder al módulo de auditoría
router.use(verifyToken, checkRole(['SUPER_ADMIN']));

router.get('/',           ctrl.getAll);
router.get('/stats',      ctrl.getStats);
router.get('/export',     ctrl.exportAll);
router.delete('/purge',   ctrl.purge);

module.exports = router;
