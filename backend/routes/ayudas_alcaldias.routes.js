const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/ayudas_alcaldias.controller');
const verifyToken = require('../middleware/auth');
const audit      = require('../middleware/audit');

router.get('/',            verifyToken,        ctrl.getAll);
router.get('/resumen-mapa',verifyToken,        ctrl.resumenMapa);
router.post('/',           verifyToken, audit, ctrl.create);
router.put('/:id',         verifyToken, audit, ctrl.update);
router.delete('/:id',      verifyToken, audit, ctrl.remove);

module.exports = router;
