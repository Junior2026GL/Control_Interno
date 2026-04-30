const router  = require('express').Router();
const path    = require('path');
const multer  = require('multer');
const verifyToken = require('../middleware/auth');
const checkRole   = require('../middleware/role');
const ctrl        = require('../controllers/database.controller');

// Multer – store uploads in a temp folder
const upload = multer({
  dest: path.join(__dirname, '../uploads/temp'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.sql')) return cb(null, true);
    cb(new Error('Solo se permiten archivos .sql'));
  },
});

const superAdmin = [verifyToken, checkRole(['SUPER_ADMIN'])];

router.get ('/config',            ...superAdmin, ctrl.getConfig);
router.post('/config',            ...superAdmin, ctrl.saveConfig);
router.post('/backup/run',        ...superAdmin, ctrl.manualBackup);
router.get ('/export',            ...superAdmin, ctrl.exportDB);
router.post('/import',            ...superAdmin, upload.single('sqlFile'), ctrl.importDB);
router.get ('/backups',           ...superAdmin, ctrl.listBackups);
router.get ('/backups/:filename', ...superAdmin, ctrl.downloadBackup);
router.delete('/backups/:filename',...superAdmin, ctrl.deleteBackup);
router.get ('/download-log',      ...superAdmin, ctrl.getDownloadLog);

module.exports = router;
