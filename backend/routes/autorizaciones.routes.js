const router     = require('express').Router();
const rateLimit  = require('express-rate-limit');
const verify     = require('../middleware/auth');
const audit      = require('../middleware/audit');
const ctrl       = require('../controllers/autorizaciones.controller');

// Limite estricto para el endpoint de firma (evita fuerza bruta de contraseña)
// keyGenerator usa el id del usuario (verify ya corrió antes → req.user siempre existe)
const firmarLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de firma. Intente de nuevo en 10 minutos.' },
  keyGenerator: (req) => `aut_firma_${req.user.id}`,
  skip: (req) => !req.user?.id, // si por alguna razón no hay user, el verify ya rechazó
});

router.get('/',                  verify, ctrl.getAll);
router.get('/:id',               verify, ctrl.getOne);
router.post('/',                 verify, audit, ctrl.create);
router.put('/:id',               verify, audit, ctrl.update);
router.put('/:id/autorizar',     verify, firmarLimiter, audit, ctrl.autorizar);
router.put('/:id/rechazar',      verify, audit, ctrl.rechazar);
router.delete('/:id',            verify, audit, ctrl.remove);

module.exports = router;
