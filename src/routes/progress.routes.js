import { Router } from 'express'
import * as progressController from '../controllers/progress.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireSelfOrAdmin } from '../middlewares/role.middleware.js'
import { ApiError } from '../utils/ApiError.js'
import { pool } from '../config/db.js'

const router = Router()
router.use(requireAuth)

// Poids
router.get('/:userId/weight', requireSelfOrAdmin('userId'), progressController.listWeight)
router.post('/:userId/weight', requireSelfOrAdmin('userId'), progressController.addWeight)

// Bloc-notes — consultable par le client ET l'admin/coach (historique conservé)
router.get('/:userId/notes', requireSelfOrAdmin('userId'), progressController.listNotes)
router.post('/:userId/notes', requireSelfOrAdmin('userId'), progressController.addNote)

// Journal d'entraînement structuré
router.get('/:userId/exercise-log', requireSelfOrAdmin('userId'), progressController.listExerciseLog)
router.post('/:userId/exercise-log', requireSelfOrAdmin('userId'), progressController.addExerciseLog)

async function requireOwnLogEntry(req, res, next) {
  const [rows] = await pool.query('SELECT user_id FROM exercise_logs WHERE id = ?', [req.params.id])
  if (!rows[0]) return next(new ApiError(404, 'Entrée introuvable'))
  if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
    return next(new ApiError(403, "Cette entrée ne t'appartient pas"))
  }
  next()
}
router.delete('/exercise-log/:id', requireOwnLogEntry, progressController.removeExerciseLog)

export default router
