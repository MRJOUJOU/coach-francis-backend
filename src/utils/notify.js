import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { getIo } from '../sockets/index.js'
import { webpush, pushConfigured } from '../config/webpush.js'

/**
 * Crée une notification pour un utilisateur : l'insère en base, la pousse en
 * temps réel via Socket.IO si l'utilisateur a un onglet ouvert, et déclenche
 * une notification push mobile s'il a un appareil abonné. Point d'entrée
 * unique pour ne jamais dupliquer cette logique entre les contrôleurs.
 */
export async function notifyUser(userId, { type, title, body, link }) {
  const id = uuid()
  await pool.query(
    'INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)',
    [id, userId, type, title, body || null, link || null],
  )

  const io = getIo()
  io?.to(`user:${userId}`).emit('notification:new')

  if (pushConfigured) {
    const [subs] = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId])
    const payload = JSON.stringify({ title, body, link })
    for (const sub of subs) {
      const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
      webpush.sendNotification(pushSubscription, payload).catch(async (err) => {
        // Abonnement expiré/révoqué (410/404) : on le retire silencieusement
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id])
        }
      })
    }
  }

  return id
}

export async function notifyAdmins({ type, title, body, link }) {
  const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'")
  for (const admin of admins) {
    await notifyUser(admin.id, { type, title, body, link })
  }
}
