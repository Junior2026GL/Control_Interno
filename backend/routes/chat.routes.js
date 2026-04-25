const router      = require('express').Router();
const verifyToken = require('../middleware/auth');
const ctrl        = require('../controllers/chat.controller');

router.use(verifyToken);

router.post('/message', ctrl.sendMessage);
router.post('/tts',     ctrl.textToSpeech);

module.exports = router;
