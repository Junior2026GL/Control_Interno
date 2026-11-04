const express     = require('express');
const router      = express.Router();
const verifyToken = require('../middleware/auth');
const checkRole   = require('../middleware/role');
const ctrl        = require('../controllers/beneficiarios_ayuda.controller');

router.get('/por-mes', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN', 'ASISTENTE']), ctrl.porMes);
router.get('/',verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN', 'ASISTENTE']), ctrl.getAll);

module.exports = router;
