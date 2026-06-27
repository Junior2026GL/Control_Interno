const router     = require('express').Router();
const verify     = require('../middleware/auth');
const audit      = require('../middleware/audit');
const ctrl       = require('../controllers/autorizaciones.controller');

router.get('/',                  verify, ctrl.getAll);
router.get('/config/correlativo', verify, ctrl.getCorrelativoConfig);
router.put('/config/correlativo', verify, audit, ctrl.updateCorrelativoConfig);
router.get('/:id',               verify, ctrl.getOne);
router.post('/',                 verify, audit, ctrl.create);
router.put('/:id',               verify, audit, ctrl.update);
router.put('/:id/autorizar',     verify, audit, ctrl.autorizar);
router.put('/:id/rechazar',      verify, audit, ctrl.rechazar);
router.delete('/:id',            verify, audit, ctrl.remove);

module.exports = router;
