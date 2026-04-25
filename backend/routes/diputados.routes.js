const express        = require('express');
const router         = express.Router();
const verifyToken    = require('../middleware/auth');
const checkRole      = require('../middleware/role');
const auditMiddleware = require('../middleware/audit');
const ctrl           = require('../controllers/diputados.controller');

// Listar — cualquier usuario autenticado con acceso al módulo
router.get('/', verifyToken, ctrl.getAll);

// Crear — SUPER_ADMIN y ADMIN
router.post('/', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN']), auditMiddleware, ctrl.create);

// Actualizar — SUPER_ADMIN y ADMIN
router.put('/:id', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN']), auditMiddleware, ctrl.update);

// Activar / desactivar — SUPER_ADMIN y ADMIN
router.patch('/:id/toggle', verifyToken, checkRole(['SUPER_ADMIN', 'ADMIN']), auditMiddleware, ctrl.toggleActive);

module.exports = router;
