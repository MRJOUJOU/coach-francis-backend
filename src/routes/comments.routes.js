import { Router } from 'express'
import * as commentsController from '../controllers/comments.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireRole } from '../middlewares/role.middleware.js'

const router = Router()

router.get('/published', commentsController.listPublished) // public
router.post('/', requireAuth, requireRole('client'), commentsController.create)

router.get('/admin/all', requireAuth, requireRole('admin'), commentsController.listAll)
router.put('/admin/:id/publish', requireAuth, requireRole('admin'), commentsController.togglePublish)
router.delete('/admin/:id', requireAuth, requireRole('admin'), commentsController.remove)

export default router
