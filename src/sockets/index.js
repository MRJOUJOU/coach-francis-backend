import { Server } from 'socket.io'
import { verifyAccessToken } from '../utils/jwt.js'

// Référence partagée pour émettre des événements depuis des endroits sans
// accès direct à `req` (ex : tâches planifiées / cron).
let ioRef = null
export function getIo() {
  return ioRef
}

export function initSockets(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  })

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) throw new Error('no token')
      const payload = verifyAccessToken(token)
      socket.user = { id: payload.sub, role: payload.role }
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    // Chaque utilisateur rejoint sa propre room pour recevoir ses notifications
    socket.join(`user:${socket.user.id}`)

    // Rejoindre une conversation précise (le client sa propre conv, l'admin celle d'un client donné)
    socket.on('conversation:join', (conversationId) => {
      socket.join(`conversation:${conversationId}`)
    })

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`)
    })
  })

  ioRef = io
  return io
}
