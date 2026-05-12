const router = require('express').Router();
const verify = require('../middleware/auth');
const audit  = require('../middleware/audit');
const ctrl   = require('../controllers/orden_checklist.controller');

router.get('/',          verify, ctrl.getByAnio);
router.get('/anios',     verify, ctrl.getAnios);
router.get('/proxima',   verify, ctrl.getProxima);
router.post('/reservar', verify, ctrl.reservar);
router.post('/liberar',  verify, ctrl.liberar);
router.post('/confirmar',verify, audit, ctrl.confirmar);
router.post('/generar',  verify, audit, ctrl.generar);

module.exports = router;
