import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js'
import { toPublicUser } from './users.controller.js'
import { publicUrlFor } from '../middlewares/upload.middleware.js'
import { uploadBufferToCloudinary } from '../services/cloudinary.service.js'

const REFRESH_COOKIE = 'cf_refresh'
const isProd = process.env.NODE_ENV === 'production'

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/auth',
  })
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) throw new ApiError(400, 'Email et mot de passe requis')

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email])
  const user = rows[0]
  if (!user) throw new ApiError(401, 'Identifiants incorrects')

  const match = await bcrypt.compare(password, user.password_hash)
  if (!match) throw new ApiError(401, 'Identifiants incorrects')

  if (user.status !== 'active') throw new ApiError(403, 'Ce compte est désactivé — contacte ton coach')

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
  await pool.query('INSERT INTO activity_logs (id, user_id, event_type, meta) VALUES (?, ?, ?, ?)', [
    uuid(),
    user.id,
    'login',
    JSON.stringify({ ip: req.ip }),
  ])

  const accessToken = signAccessToken(user)
  const refreshToken = signRefreshToken(user)
  const refreshHash = await bcrypt.hash(refreshToken, 8)

  await pool.query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))',
    [uuid(), user.id, refreshHash],
  )

  setRefreshCookie(res, refreshToken)
  res.json({ accessToken, user: toPublicUser(user) })
})

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (!token) throw new ApiError(401, 'Session absente — reconnecte-toi')

  let payload
  try {
    payload = verifyRefreshToken(token)
  } catch {
    throw new ApiError(401, 'Session expirée — reconnecte-toi')
  }

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [payload.sub])
  const user = rows[0]
  if (!user) throw new ApiError(401, 'Utilisateur introuvable')

  const accessToken = signAccessToken(user)
  res.json({ accessToken, user: toPublicUser(user) })
})

export const logout = asyncHandler(async (req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/auth' })
  res.status(204).send()
})

export const me = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id])
  const user = rows[0]
  if (!user) throw new ApiError(404, 'Utilisateur introuvable')
  res.json(toPublicUser(user))
})

export const completeOnboarding = asyncHandler(async (req, res) => {
  const { heightCm, weightKg, goals } = req.body
  await pool.query(
    'UPDATE users SET has_onboarded = 1, height_cm = ?, goals = ? WHERE id = ?',
    [heightCm || null, Array.isArray(goals) ? goals.join(', ') : goals || null, req.user.id],
  )
  if (weightKg) {
    await pool.query('INSERT INTO body_measurements (id, user_id, weight) VALUES (?, ?, ?)', [
      uuid(),
      req.user.id,
      weightKg,
    ])
  }
  res.status(204).send()
})

// PUT /auth/me — le client/l'admin modifie SON PROPRE profil (nom, email, mot de passe)
export const updateMe = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, currentPassword, newPassword } = req.body

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id])
  const user = rows[0]
  if (!user) throw new ApiError(404, 'Utilisateur introuvable')

  const fields = []
  const values = []
  if (firstName !== undefined) { fields.push('first_name = ?'); values.push(firstName) }
  if (lastName !== undefined) { fields.push('last_name = ?'); values.push(lastName) }
  if (email !== undefined && email !== user.email) {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id])
    if (existing.length) throw new ApiError(409, 'Cet email est déjà utilisé par un autre compte')
    fields.push('email = ?')
    values.push(email)
  }

  if (newPassword) {
    if (!currentPassword) throw new ApiError(400, 'Mot de passe actuel requis pour le changer')
    const match = await bcrypt.compare(currentPassword, user.password_hash)
    if (!match) throw new ApiError(401, 'Mot de passe actuel incorrect')
    fields.push('password_hash = ?')
    values.push(await bcrypt.hash(newPassword, 10))
  }

  if (!fields.length) throw new ApiError(400, 'Aucune modification fournie')
  values.push(req.user.id)
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)

  const [[updated]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id])
  res.json(toPublicUser(updated))
})

// POST /auth/me/photo — photo de profil
export const uploadMyPhoto = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Aucune image reçue')
  }

  let url

  if (process.env.NODE_ENV === 'production') {
    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      'avatars'
    )

    url = result.secure_url
  } else {
    url = publicUrlFor('avatars', req.file.filename)
  }

  await pool.query(
    'UPDATE users SET avatar_url = ? WHERE id = ?',
    [url, req.user.id]
  )

  res.json({ avatarUrl: url })
})
