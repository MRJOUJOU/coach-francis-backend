import { Router } from 'express'
import * as tipsController from '../controllers/tips.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireRole } from '../middlewares/role.middleware.js'

const router = Router()

router.get('/', tipsController.getSiteContent)
router.put('/', requireAuth, requireRole('admin'), tipsController.updateSiteContent)

export default router
