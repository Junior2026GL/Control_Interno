const express      = require('express');
const router       = express.Router();
const ayudasCtrl   = require('../controllers/ayudas.controller');
const verifyToken  = require('../middleware/auth');
const audit        = require('../middleware/audit');

router.get('/',     verifyToken,        ayudasCtrl.getAyudas);
router.post('/',    verifyToken, audit, ayudasCtrl.createAyuda);
router.put('/:id',  verifyToken, audit, ayudasCtrl.updateAyuda);
router.delete('/:id', verifyToken, audit, ayudasCtrl.deleteAyuda);

module.exports = router;
