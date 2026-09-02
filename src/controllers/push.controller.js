import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'

export const getPublicKey = asyncHandler(async (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null })
})

export const subscribe = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new ApiError(400, 'Abonnement push invalide')

  await pool.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [uuid(), req.user.id, endpoint, keys.p256dh, keys.auth],
  )
  res.status(204).send()
})

export const unsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = req.body
  if (!endpoint) throw new ApiError(400, 'endpoint requis')
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, req.user.id])
  res.status(204).send()
})
