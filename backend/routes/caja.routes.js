const express = require('express');
const router = express.Router();
const cajaCtrl = require('../controllers/caja.controller');
const verifyToken = require('../middleware/auth');
const audit = require('../middleware/audit');

router.get('/',          verifyToken, cajaCtrl.getMovimientos);
router.get('/saldo',     verifyToken, cajaCtrl.getSaldo);
router.get('/usuarios',  verifyToken, cajaCtrl.getUsuariosCaja);
router.post('/',         verifyToken, audit, cajaCtrl.createMovimiento);
router.put('/:id',       verifyToken, audit, cajaCtrl.updateMovimiento);
router.delete('/:id',    verifyToken, audit, cajaCtrl.deleteMovimiento);

module.exports = router;