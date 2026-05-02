const router     = require('express').Router();
const ctrl       = require('../controllers/proveedores.controller');
const verifyToken = require('../middleware/auth');

router.get   ('/',    verifyToken, ctrl.getAll);
router.post  ('/',    verifyToken, ctrl.create);
router.put   ('/:id', verifyToken, ctrl.update);
router.delete('/:id', verifyToken, ctrl.remove);

module.exports = router;
