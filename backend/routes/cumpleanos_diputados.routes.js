const express     = require('express');
const router      = express.Router();
const verifyToken = require('../middleware/auth');
const checkRole   = require('../middleware/role');
const ctrl        = require('../controllers/cumpleanos_diputados.controller');

const rolesPermitidos      = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'];
const rolesAdministradores = ['SUPER_ADMIN', 'ADMIN'];

// GET /api/cumpleanos-diputados/stats
router.get('/stats',   verifyToken, checkRole(rolesPermitidos),      ctrl.getStats);

// GET /api/cumpleanos-diputados/listado  — todos los diputados (con/sin fecha) para gestión CRUD
router.get('/listado', verifyToken, checkRole(rolesAdministradores),  ctrl.getListado);

// GET /api/cumpleanos-diputados
router.get('/',        verifyToken, checkRole(rolesPermitidos),       ctrl.getAll);

// POST /api/cumpleanos-diputados — crear o actualizar fecha de nacimiento
router.post('/',       verifyToken, checkRole(rolesAdministradores),  ctrl.upsert);

// PUT /api/cumpleanos-diputados/:diputadoId — actualizar fecha (alias de POST)
router.put('/:diputadoId', verifyToken, checkRole(rolesAdministradores), (req, res) => {
  req.body.diputado_id = req.params.diputadoId;
  ctrl.upsert(req, res);
});

// DELETE /api/cumpleanos-diputados/:diputadoId — eliminar fecha de nacimiento
router.delete('/:diputadoId', verifyToken, checkRole(rolesAdministradores), ctrl.remove);

module.exports = router;
