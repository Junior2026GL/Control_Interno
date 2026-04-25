const express     = require('express');
const router      = express.Router();
const verifyToken = require('../middleware/auth');
const ctrl        = require('../controllers/viaticos.controller');

// Buscar diputado por DNI (autocompletar)
router.get('/diputado/:identidad', verifyToken, ctrl.getByDNI);

// CRUD viáticos
router.get('/',    verifyToken, ctrl.getAll);
router.get('/:id', verifyToken, ctrl.getOne);
router.post('/',   verifyToken, ctrl.create);
router.put('/:id',    verifyToken, ctrl.update);
router.delete('/:id', verifyToken, ctrl.remove);

module.exports = router;
