const router = require('express').Router();
const verify = require('../middleware/auth');
const audit  = require('../middleware/audit');
const ctrl   = require('../controllers/sap_transferencia.controller');

router.get('/',            verify, ctrl.getAll);
router.get('/:id',         verify, ctrl.getOne);
router.post('/',           verify, audit, ctrl.create);
router.put('/:id',         verify, audit, ctrl.update);
router.post('/:id/anular', verify, audit, ctrl.anular);

module.exports = router;
