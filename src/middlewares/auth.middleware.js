import { verifyAccessToken } from '../utils/jwt.js'
import { ApiError } from '../utils/ApiError.js'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return next(new ApiError(401, "Authentification requise"))
  }
  const token = header.slice(7)
  try {
    const payload = verifyAccessToken(token)
    req.user = { id: payload.sub, role: payload.role, email: payload.email }
    next()
  } catch {
    next(new ApiError(401, 'Session expirée ou invalide'))
  }
}
