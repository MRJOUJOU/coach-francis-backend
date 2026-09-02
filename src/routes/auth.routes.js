import { Router } from 'express'
import * as authController from '../controllers/auth.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { uploadFor } from '../middlewares/upload.middleware.js'

const router = Router()

router.post('/login', authController.login)
router.post('/refresh', authController.refresh)
router.post('/logout', authController.logout)
router.get('/me', requireAuth, authController.me)
router.put('/me', requireAuth, authController.updateMe)
router.post('/me/photo', requireAuth, uploadFor('avatars').single('image'), authController.uploadMyPhoto)
router.post('/onboarding', requireAuth, authController.completeOnboarding)

export default router
