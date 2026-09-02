import { Router } from 'express'
import * as tipsController from '../controllers/tips.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireRole } from '../middlewares/role.middleware.js'

const router = Router()

router.get('/', tipsController.listTips)
router.post('/', requireAuth, requireRole('admin'), tipsController.createTip)
router.put('/:id', requireAuth, requireRole('admin'), tipsController.updateTip)
router.delete('/:id', requireAuth, requireRole('admin'), tipsController.deleteTip)

export default router
