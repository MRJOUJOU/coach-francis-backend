import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import authRoutes from './routes/auth.routes.js'
import adminUsersRoutes from './routes/admin.users.routes.js'
import programsRoutes from './routes/programs.routes.js'
import adminProgramsRoutes from './routes/admin.programs.routes.js'
import workoutsRoutes from './routes/workouts.routes.js'
import progressRoutes from './routes/progress.routes.js'
import messagesRoutes from './routes/messages.routes.js'
import notificationsRoutes from './routes/notifications.routes.js'
import tipsRoutes from './routes/tips.routes.js'
import siteContentRoutes from './routes/siteContent.routes.js'
import plannedSessionsRoutes from './routes/plannedSessions.routes.js'
import commentsRoutes from './routes/comments.routes.js'
import invitationsRoutes from './routes/invitations.routes.js'
import pushRoutes from './routes/push.routes.js'
import { requireAuth } from './middlewares/auth.middleware.js'
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js'
import { asyncHandler } from './utils/asyncHandler.js'
import * as workoutsController from './controllers/workouts.controller.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()

  app.use(helmet({ crossOriginResourcePolicy: false }))
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  // Fichiers uploadés (images de jours/exercices) servis statiquement
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

  app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

  app.use('/auth', authRoutes)
  app.use('/admin/users', adminUsersRoutes)
  app.use('/programs', programsRoutes)
  app.use('/admin', adminProgramsRoutes)
  app.use('/workouts', workoutsRoutes)
  app.use('/progress', progressRoutes)
  app.use('/messages', messagesRoutes)
  app.use('/notifications', notificationsRoutes)
  app.use('/tips', tipsRoutes)
  app.use('/site-content', siteContentRoutes)
  app.use('/planned-sessions', plannedSessionsRoutes)
  app.use('/comments', commentsRoutes)
  app.use('/invitations', invitationsRoutes)
  app.use('/push', pushRoutes)

  // Heartbeat d'activité (onglet actif côté client) — voir §21 du cahier des charges
  app.post('/activity/heartbeat', requireAuth, asyncHandler(workoutsController.heartbeat))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
