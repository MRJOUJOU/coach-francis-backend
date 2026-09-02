import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'

function mapNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    isRead: !!row.is_read,
    createdAt: row.created_at,
  }
}

export const listForUser = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [
    req.user.id,
  ])
  res.json(rows.map(mapNotification))
})

export const markRead = asyncHandler(async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
  res.status(204).send()
})

export const markAllRead = asyncHandler(async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id])
  res.status(204).send()
})
