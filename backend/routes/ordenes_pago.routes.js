'use strict';

const express      = require('express');
const router       = express.Router();
const verifyToken  = require('../middleware/auth');
const checkRole    = require('../middleware/role');
const audit        = require('../middleware/audit');
const ctrl         = require('../controllers/ordenes_pago.controller');

const soloOperacion  = checkRole(['SUPER_ADMIN', 'ADMIN', 'ASISTENTE']);
const soloAprobacion = checkRole(['SUPER_ADMIN', 'ADMIN']);

// ── Consulta ──────────────────────────────────────────────────────────────────

// Listar órdenes con filtros y paginación
router.get('/', verifyToken, ctrl.getAll);

// Detalle de una orden + historial de impresiones
router.get('/:id(\\d+)', verifyToken, ctrl.getById);

// Historial de impresiones de una orden
router.get('/:id(\\d+)/impresiones', verifyToken, ctrl.getImpresiones);

// Generar PDF de la orden (solo APROBADA, IMPRESA o ENTREGADA)
// ?motivo_reimpresion=texto  (opcional en reimpresiones)
router.get('/:id(\\d+)/pdf', verifyToken, ctrl.generarPDF);

// ── Mutaciones ────────────────────────────────────────────────────────────────

// Crear nueva orden en estado BORRADOR
router.post('/', verifyToken, soloOperacion, audit, ctrl.create);

// Actualizar orden (solo BORRADOR)
router.put('/:id(\\d+)', verifyToken, soloOperacion, audit, ctrl.update);

// Aprobar orden: BORRADOR → APROBADA  (asigna numero_orden correlativo)
router.patch('/:id(\\d+)/aprobar', verifyToken, soloAprobacion, audit, ctrl.aprobar);

// Marcar como entregada: IMPRESA → ENTREGADA
router.patch('/:id(\\d+)/entregar', verifyToken, soloAprobacion, audit, ctrl.entregar);

// Anular orden (requiere motivo en body)
router.patch('/:id(\\d+)/anular', verifyToken, soloAprobacion, audit, ctrl.anular);

module.exports = router;
