import { ApiError } from '../utils/ApiError.js'

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route introuvable : ${req.method} ${req.originalUrl}` })
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message })
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Cette ressource existe déjà (doublon)' })
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `Erreur d'upload : ${err.message}` })
  }

  console.error('[UNHANDLED ERROR]', err)
  res.status(500).json({ error: "Erreur interne du serveur" })
}
