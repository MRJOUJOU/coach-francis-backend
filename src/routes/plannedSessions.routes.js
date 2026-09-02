import { Router } from 'express'
import * as plannedController from '../controllers/plannedSessions.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireSelfOrAdmin, requireRole } from '../middlewares/role.middleware.js'
import { uploadFor } from '../middlewares/upload.middleware.js'
import { ApiError } from '../utils/ApiError.js'
import { pool } from '../config/db.js'

const router = Router()
router.use(requireAuth)

router.post('/upload-image', uploadFor('planned').single('image'), plannedController.uploadImage)

router.get('/admin/today', requireRole('admin'), plannedController.listTodayAdmin)

router.get('/:userId', requireSelfOrAdmin('userId'), plannedController.listForUser)
router.post('/:userId', requireSelfOrAdmin('userId'), plannedController.create)

// Pour update/delete par id, on vérifie la propriété en base avant d'autoriser
async function requireOwnPlannedSession(req, res, next) {
  const [rows] = await pool.query('SELECT user_id FROM planned_sessions WHERE id = ?', [req.params.id])
  if (!rows[0]) return next(new ApiError(404, 'Séance planifiée introuvable'))
  if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
    return next(new ApiError(403, "Cette séance planifiée ne t'appartient pas"))
  }
  next()
}

router.put('/item/:id', requireOwnPlannedSession, plannedController.update)
router.delete('/item/:id', requireOwnPlannedSession, plannedController.remove)

export default router
