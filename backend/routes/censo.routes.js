const router = require('express').Router();
const auth   = require('../middleware/auth');
const ctrl   = require('../controllers/censo.controller');

router.get('/:dni', auth, ctrl.buscarPorDni);

module.exports = router;
