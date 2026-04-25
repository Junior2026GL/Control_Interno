const express    = require('express');
const router     = express.Router();
const verifyToken = require('../middleware/auth');
const checkRole  = require('../middleware/role');
const ctrl       = require('../controllers/ip-whitelist.controller');

// Todas las rutas son solo para SUPER_ADMIN
router.use(verifyToken, checkRole(['SUPER_ADMIN']));

router.get('/',        ctrl.getAll);
router.get('/my-ip',   ctrl.getMyIP);
router.post('/',       ctrl.create);
router.put('/:id',     ctrl.update);
router.delete('/:id',  ctrl.remove);

module.exports = router;
