const express    = require('express');
const router     = express.Router();
const verifyToken = require('../middleware/auth');
const checkRole   = require('../middleware/role');
const audit       = require('../middleware/audit');
const ctrl        = require('../controllers/presupuesto.controller');

const onlyAdmins = checkRole(['SUPER_ADMIN', 'ADMIN']);

// Resumen general del año — cualquier usuario autenticado
router.get('/resumen', verifyToken, ctrl.getResumen);

// Listado de ayudas con filtros — reportes
router.get('/reportes/ayudas', verifyToken, ctrl.getReportesAyudas);

// Ejecución mensual por año
router.get('/reportes/mensual', verifyToken, ctrl.getReportesMensual);

// Top ayudas por monto
router.get('/reportes/top', verifyToken, ctrl.getReportesTop);

// Datos de un diputado para el año — cualquier usuario autenticado
router.get('/diputado/:diputado_id', verifyToken, ctrl.getByDiputado);

// Asignar presupuesto — admin
router.post('/', verifyToken, onlyAdmins, audit, ctrl.createPresupuesto);

// Editar monto asignado — admin
router.put('/:id', verifyToken, onlyAdmins, audit, ctrl.updatePresupuesto);

// Registrar ayuda social — admin
router.post('/:id/ayudas', verifyToken, onlyAdmins, audit, ctrl.createAyuda);

// Editar ayuda — admin
router.put('/:id/ayudas/:aid_id', verifyToken, onlyAdmins, audit, ctrl.updateAyuda);

// Actualizar estado de liquidación — admin
router.patch('/:id/ayudas/:aid_id/liquidacion', verifyToken, onlyAdmins, audit, ctrl.patchLiquidacion);

// Eliminar ayuda — admin
router.delete('/:id/ayudas/:aid_id', verifyToken, onlyAdmins, audit, ctrl.deleteAyuda);

module.exports = router;
