const express        = require('express');
const router         = express.Router();
const verifyToken    = require('../middleware/auth');
const checkRole      = require('../middleware/role');
const auditMiddleware = require('../middleware/audit');
const ctrl           = require('../controllers/diputados.controller');

// Listar — cualquier usuario autenticado con acceso al módulo
router.get('/', verifyToken, ctrl.getAll);

// Crear — SUPER_ADMIN, ADMIN y ASISTENTE
router.post('/', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN', 'ASISTENTE']), auditMiddleware, ctrl.create);

// Actualizar — SUPER_ADMIN, ADMIN y ASISTENTE
router.put('/:id', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN', 'ASISTENTE']), auditMiddleware, ctrl.update);

// Activar / desactivar — SUPER_ADMIN, ADMIN y ASISTENTE
router.patch('/:id/toggle', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN', 'ASISTENTE']), auditMiddleware, ctrl.toggleActive);

module.exports = router;
