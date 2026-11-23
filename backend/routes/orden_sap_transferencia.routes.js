const router = require('express').Router();
const verify = require('../middleware/auth');
const audit  = require('../middleware/audit');
const ctrl   = require('../controllers/orden_sap_transferencia.controller');

router.get('/',          verify, ctrl.getByAnio);
router.get('/anios',     verify, ctrl.getAnios);
router.get('/proxima',   verify, ctrl.getProxima);
router.post('/reservar', verify, ctrl.reservar);
router.post('/liberar',  verify, ctrl.liberar);
router.post('/generar',  verify, audit, ctrl.generar);

module.exports = router;
