import { Router } from 'express'
import * as usersController from '../controllers/users.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireRole } from '../middlewares/role.middleware.js'
import { uploadFor } from '../middlewares/upload.middleware.js'

const router = Router()
router.use(requireAuth, requireRole('admin'))

router.get('/', usersController.listUsers)
router.get('/dashboard-stats', usersController.getDashboardStats)
router.post('/', usersController.createUser)
router.get('/:id', usersController.getUser)
router.put('/:id', usersController.updateUser)
router.delete('/:id', usersController.deleteUser)
router.get('/:id/stats', usersController.getUserStats)
router.post('/:id/avatar', uploadFor('avatars').single('image'), usersController.uploadUserAvatar)

export default router
