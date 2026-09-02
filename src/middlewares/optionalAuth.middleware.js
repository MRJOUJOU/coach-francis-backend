import { verifyAccessToken } from '../utils/jwt.js'

// Contrairement à requireAuth, ne bloque jamais la requête : sert pour les
// routes publiques dont le contenu varie légèrement si l'utilisateur est connecté
// (ex: /programs, pour calculer le déblocage de palier propre à un client).
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice(7))
      req.user = { id: payload.sub, role: payload.role, email: payload.email }
    } catch {
      // token invalide/expiré : on continue simplement sans utilisateur
    }
  }
  next()
}
