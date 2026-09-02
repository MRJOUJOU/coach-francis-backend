import { Router } from 'express'
import * as messagesController from '../controllers/messages.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireRole } from '../middlewares/role.middleware.js'

const router = Router()
router.use(requireAuth)

router.get('/mine', requireRole('client'), messagesController.myConversation)
router.get('/admin/conversations', requireRole('admin'), messagesController.listConversations)
router.post('/', messagesController.sendMessage)

export default router
