import { Router } from 'express'
import * as invitationsController from '../controllers/invitations.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireRole } from '../middlewares/role.middleware.js'

const router = Router()

router.post('/', requireAuth, requireRole('admin'), invitationsController.create)
router.get('/:token', invitationsController.check)
router.post('/:token/accept', invitationsController.accept)

export default router
