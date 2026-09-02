import { Router } from 'express'
import * as notificationsController from '../controllers/notifications.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'

const router = Router()
router.use(requireAuth)

router.get('/', notificationsController.listForUser)
router.put('/:id/read', notificationsController.markRead)
router.put('/read-all', notificationsController.markAllRead)

export default router
