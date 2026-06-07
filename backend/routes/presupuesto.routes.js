const express    = require('express');
const router     = express.Router();
const verifyToken = require('../middleware/auth');
const checkRole   = require('../middleware/role');
const audit       = require('../middleware/audit');
const ctrl        = require('../controllers/presupuesto.controller');

const onlyAdmins = checkRole(['SUPER_ADMIN', 'ADMIN', 'ASISTENTE']);

// Resumen general del año — cualquier usuario autenticado
router.get('/resumen', verifyToken, ctrl.getResumen);

// Resumen de ejecución mensual con desglose por partido
router.get('/resumen-por-mes', verifyToken, ctrl.getResumenMensualPartido);

// Resumen agrupado por partido con pills de meses
router.get('/resumen-partido-mes', verifyToken, ctrl.getResumenPartidoMes);

// Detalle ejecutaron / no ejecutaron por partido y mes
router.get('/mes-partido-detalle', verifyToken, ctrl.getMesPartidoDetalle);

// Listado de ayudas con filtros — reportes
router.get('/reportes/ayudas', verifyToken, ctrl.getReportesAyudas);

// Ejecución mensual por año
router.get('/reportes/mensual', verifyToken, ctrl.getReportesMensual);

// Top ayudas por monto
router.get('/reportes/top', verifyToken, ctrl.getReportesTop);

// Reporte mensual detallado por diputado
router.get('/reportes/mensual-detalle', verifyToken, ctrl.getReporteMensualDetalle);

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

// Asignar número de orden — admin
router.patch('/:id/ayudas/:aid_id/orden', verifyToken, onlyAdmins, audit, ctrl.patchOrden);

// Eliminar ayuda — admin
router.delete('/:id/ayudas/:aid_id', verifyToken, onlyAdmins, audit, ctrl.deleteAyuda);

module.exports = router;
