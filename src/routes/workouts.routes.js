import { Router } from 'express'
import * as workoutsController from '../controllers/workouts.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireRole, requireSelfOrAdmin } from '../middlewares/role.middleware.js'

const router = Router()
router.use(requireAuth)

router.post('/start', workoutsController.startSession)
router.get('/last-performance/:exerciseId', workoutsController.getLastPerformance)
router.post('/:sessionId/report', workoutsController.submitReport)
router.get('/user/:userId', requireSelfOrAdmin('userId'), workoutsController.listSessionsForUser)
router.get('/', requireRole('admin'), workoutsController.listAllSessions)

export default router
