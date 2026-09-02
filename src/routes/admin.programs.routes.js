import { Router } from 'express'
import * as programsController from '../controllers/programs.controller.js'
import * as daysController from '../controllers/days.controller.js'
import * as exercisesController from '../controllers/exercises.controller.js'
import { requireAuth } from '../middlewares/auth.middleware.js'
import { requireRole } from '../middlewares/role.middleware.js'
import { uploadFor } from '../middlewares/upload.middleware.js'

const router = Router()
router.use(requireAuth, requireRole('admin'))

// Programmes
router.post('/programs', programsController.createProgram)
router.put('/programs/:id', programsController.updateProgram)
router.put('/programs/:id/toggle-lock', programsController.toggleProgramLock)
router.put('/programs/:id/access', programsController.setProgramAccess) // per-client unlock
router.delete('/programs/:id', programsController.deleteProgram)

// Semaines
router.post('/programs/:programId/weeks', programsController.createWeek)
router.put('/weeks/:id', programsController.updateWeek) // rename / update
router.put('/weeks/:id/toggle-lock', programsController.toggleWeekLock)
router.put('/weeks/:id/access', programsController.setWeekAccess) // per-client unlock
router.post('/weeks/:id/duplicate', programsController.duplicateWeek)
router.delete('/weeks/:id', programsController.deleteWeek)

// Jours
router.post('/weeks/:weekId/days', daysController.createDay)
router.put('/days/:id', daysController.updateDay)
router.delete('/days/:id', daysController.deleteDay)
router.put('/days/reorder', daysController.reorderDays)
router.post('/days/:id/image', uploadFor('days').single('image'), daysController.uploadDayImage)
router.post('/days/:id/summary-image', uploadFor('days').single('image'), daysController.uploadDaySummaryImage)
router.delete('/days/:id/summary-image', daysController.removeDaySummaryImage)

// Exercices
router.post('/days/:dayId/exercises', exercisesController.createExercise)
router.put('/exercises/:id', exercisesController.updateExercise)
router.delete('/exercises/:id', exercisesController.deleteExercise)
router.put('/exercises/reorder', exercisesController.reorderExercises)
router.post('/exercises/:id/image', uploadFor('exercises').single('image'), exercisesController.uploadExerciseImage)

export default router
