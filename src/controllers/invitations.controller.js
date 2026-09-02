import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { toPublicUser } from './users.controller.js'
import { signAccessToken, signRefreshToken } from '../utils/jwt.js'

// POST /admin/invitations — génère un lien d'inscription à 72h, l'admin l'envoie lui-même (mailto)
export const create = asyncHandler(async (req, res) => {
  const { email, subscriptionEnd } = req.body
  if (!email) throw new ApiError(400, 'Email requis')

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email])
  if (existing.length) throw new ApiError(409, 'Un compte existe déjà avec cet email')

  const id = uuid()
  const token = crypto.randomBytes(24).toString('hex')
  await pool.query(
    `INSERT INTO invitations (id, token, email, subscription_end, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))`,
    [id, token, email, subscriptionEnd || null],
  )
  res.status(201).json({ token, email, subscriptionEnd: subscriptionEnd || null })
})

// GET /invitations/:token — vérifie la validité (pour la page d'inscription publique)
export const check = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM invitations WHERE token = ?', [req.params.token])
  const inv = rows[0]
  if (!inv || inv.used || new Date(inv.expires_at) < new Date()) {
    throw new ApiError(410, 'Ce lien d\'invitation est invalide ou expiré')
  }
  res.json({ email: inv.email })
})

// POST /invitations/:token/accept — le client finalise son compte lui-même
export const accept = asyncHandler(async (req, res) => {
  const { firstName, lastName, password } = req.body
  if (!firstName || !lastName || !password) throw new ApiError(400, 'Prénom, nom et mot de passe requis')

  const [rows] = await pool.query('SELECT * FROM invitations WHERE token = ?', [req.params.token])
  const inv = rows[0]
  if (!inv || inv.used || new Date(inv.expires_at) < new Date()) {
    throw new ApiError(410, "Ce lien d'invitation est invalide ou expiré")
  }

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [inv.email])
  if (existing.length) throw new ApiError(409, 'Un compte existe déjà avec cet email')

  const userId = uuid()
  const passwordHash = await bcrypt.hash(password, 10)
  const palette = ['#3d7fff', '#c6ff3d', '#ff4423', '#8b96a5', '#ff8a3d']
  const avatarColor = palette[Math.floor(Math.random() * palette.length)]

  await pool.query(
    `INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, avatar_color, subscription_end)
     VALUES (?, ?, ?, ?, ?, 'client', 'active', ?, ?)`,
    [userId, firstName, lastName, inv.email, passwordHash, avatarColor, inv.subscription_end],
  )
  await pool.query('UPDATE invitations SET used = 1 WHERE id = ?', [inv.id])

  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId])
  const accessToken = signAccessToken(user)
  const refreshToken = signRefreshToken(user)
  const refreshHash = await bcrypt.hash(refreshToken, 8)
  await pool.query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))',
    [uuid(), userId, refreshHash],
  )

  res.cookie('cf_refresh', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/auth',
  })
  res.status(201).json({ accessToken, user: toPublicUser(user) })
})
