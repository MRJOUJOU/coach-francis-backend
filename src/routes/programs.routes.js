import { Router } from 'express'
import * as programsController from '../controllers/programs.controller.js'
import { optionalAuth } from '../middlewares/optionalAuth.middleware.js'

const router = Router()

// Public : la page d'accueil et les clients lisent l'arbre complet des programmes actifs.
// optionalAuth permet de calculer le déblocage de palier propre au client s'il est connecté.
router.get('/', optionalAuth, programsController.listPrograms)

export default router
