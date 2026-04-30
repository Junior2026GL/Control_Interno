const express     = require('express');
const router      = express.Router();
const ctrl        = require('../controllers/alcaldes.controller');
const verifyToken = require('../middleware/auth');
const audit       = require('../middleware/audit');

router.get('/',     verifyToken,        ctrl.getAll);
router.post('/',    verifyToken, audit, ctrl.create);
router.put('/:id',  verifyToken, audit, ctrl.update);
router.delete('/:id', verifyToken, audit, ctrl.remove);

module.exports = router;
