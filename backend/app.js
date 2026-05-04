const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const ipWhitelist   = require('./middleware/ip-whitelist');
const auditMiddleware = require('./middleware/audit');
require('dotenv').config();

const app = express();

// ── Seguridad: cabeceras HTTP ─────────────────────────────────
app.use(helmet());

// TRUST_PROXY=0  → local/desarrollo (conexión directa)
// TRUST_PROXY=1  → servidor detrás de 1 proxy/Nginx
// TRUST_PROXY=2  → detrás de 2 proxies (ej. Nginx + Cloudflare)
const trustProxy = parseInt(process.env.TRUST_PROXY || '0', 10);
if (trustProxy > 0) app.set('trust proxy', trustProxy);

// ── Rate Limiting: máx 10 intentos de login por 15 min por IP ─
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de acceso. Intente nuevamente en 15 minutos.' },
});

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);

const isDev = (process.env.NODE_ENV || 'development') === 'development';

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (no origin header)
    if (!origin) return cb(null, true);
    // In development allow any localhost origin regardless of port
    if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
}));
app.use(ipWhitelist);
app.use(express.json({ limit: '1mb' }));
app.use(auditMiddleware);

app.use('/api/auth',            loginLimiter, require('./routes/auth.routes'));
app.use('/api/users',           require('./routes/users.routes'));
app.use('/api/caja',            require('./routes/caja.routes'));
app.use('/api/modulos',         require('./routes/modulos.routes'));
app.use('/api/database',        require('./routes/database.routes'));
app.use('/api/autorizaciones',  require('./routes/autorizaciones.routes'));
app.use('/api/chat',            require('./routes/chat.routes'));
app.use('/api/ip-whitelist',    require('./routes/ip-whitelist.routes'));
app.use('/api/auditoria',       require('./routes/auditoria.routes'));
app.use('/api/diputados',       require('./routes/diputados.routes'));
app.use('/api/presupuesto',     require('./routes/presupuesto.routes'));
app.use('/api/viaticos',        require('./routes/viaticos.routes'));
app.use('/api/constancias',     require('./routes/constancias.routes'));
app.use('/api/ayudas',           require('./routes/ayudas.routes'));
app.use('/api/ayudas-alcaldias', require('./routes/ayudas_alcaldias.routes'));
app.use('/api/alcaldes',         require('./routes/alcaldes.routes'));
app.use('/api/proveedores',      require('./routes/proveedores.routes'));
app.use('/api/checklist',        require('./routes/checklist.routes'));
app.use('/api/bodegas',          require('./routes/bodegas.routes'));

module.exports = app;