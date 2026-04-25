const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/modulos.controller');
const verifyToken = require('../middleware/auth');

router.get('/', verifyToken, ctrl.getAllModulos);
router.get('/usuario/:id', verifyToken, ctrl.getUserModulos);
router.put('/usuario/:id', verifyToken, ctrl.setUserModulos);

module.exports = router;
