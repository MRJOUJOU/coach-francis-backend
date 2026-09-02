import { ApiError } from '../utils/ApiError.js'

// requireRole('admin') ou requireRole('admin', 'client')
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentification requise'))
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "Accès refusé — droits insuffisants"))
    }
    next()
  }
}

// Autorise l'admin OU le propriétaire de la ressource (req.params[paramName] === user.id)
export function requireSelfOrAdmin(paramName = 'userId') {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentification requise'))
    if (req.user.role === 'admin' || req.user.id === req.params[paramName]) {
      return next()
    }
    next(new ApiError(403, "Accès refusé — ces données ne t'appartiennent pas"))
  }
}
