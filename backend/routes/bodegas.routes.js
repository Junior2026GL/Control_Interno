const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/bodegas.controller');
const verifyToken = require('../middleware/auth');
const checkRole  = require('../middleware/role');
const audit      = require('../middleware/audit');

const ADMINS = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];

router.get('/',      verifyToken,                            ctrl.getAll);
router.post('/',     verifyToken, checkRole(ADMINS), audit, ctrl.create);
router.put('/:id',   verifyToken, checkRole(ADMINS), audit, ctrl.update);
router.delete('/:id',verifyToken, checkRole(ADMINS), audit, ctrl.remove);

module.exports = router;
