import { Router } from 'express'
import * as pushController from '../controllers/push.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'

const router = Router()

router.get('/vapid-public-key', pushController.getPublicKey) // public — nécessaire avant même la connexion pour préparer l'abonnement
router.post('/subscribe', requireAuth, pushController.subscribe)
router.post('/unsubscribe', requireAuth, pushController.unsubscribe)

export default router
