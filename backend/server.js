require('dotenv').config();
const http   = require('http');
const { Server } = require('socket.io');
const app    = require('./app');
const jwt    = require('jsonwebtoken');

const PORT   = process.env.PORT || 4000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (process.env.FRONTEND_URL || 'http://localhost:5173')
      .split(',').map(s => s.trim()),
    credentials: true,
  },
});

// Mapa userId → Set de socketIds (un usuario puede tener varias pestañas)
const userSockets = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No autorizado'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.data.user = decoded;
    next();
  } catch {
    next(new Error('Token inválido'));
  }
});

io.on('connection', (socket) => {
  const { id: userId, rol, nombre } = socket.data.user;

  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socket.id);

  // Emitir a todos los sockets de un rol específico
  socket.on('disconnect', () => {
    const set = userSockets.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) userSockets.delete(userId);
    }
  });
});

// Helper: emitir evento a todos los usuarios con cierto rol
function emitToRoles(roles, event, data) {
  for (const [, sockets] of userSockets) {
    for (const socketId of sockets) {
      const s = io.sockets.sockets.get(socketId);
      if (s && roles.includes(s.data.user.rol)) {
        s.emit(event, data);
      }
    }
  }
}

// Helper: emitir a todos los sockets de un usuario
function emitToUser(userId, event, data) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }
}

// Exportar para usar en controllers
app.set('io', io);
app.set('emitToRoles', emitToRoles);
app.set('emitToUser', emitToUser);

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});