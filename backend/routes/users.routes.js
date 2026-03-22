const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/role');
const usersController = require('../controllers/users.controller');

// Listar usuarios — SUPER_ADMIN y ADMIN
router.get(
  '/',
  verifyToken,
  checkRole(['SUPER_ADMIN', 'ADMIN']),
  usersController.getUsers
);

// Crear usuario — SUPER_ADMIN y ADMIN
// (el controller valida internamente que solo SUPER_ADMIN pueda crear otro SUPER_ADMIN)
router.post(
  '/',
  verifyToken,
  checkRole(['SUPER_ADMIN', 'ADMIN']),
  usersController.createUser
);

// Actualizar usuario — SUPER_ADMIN y ADMIN
router.put(
  '/:id',
  verifyToken,
  checkRole(['SUPER_ADMIN', 'ADMIN']),
  usersController.updateUser
);

// Desactivar usuario — solo SUPER_ADMIN y ADMIN
router.delete(
  '/:id',
  verifyToken,
  checkRole(['SUPER_ADMIN', 'ADMIN']),
  usersController.deleteUser
);

module.exports = router;