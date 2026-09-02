import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'

export const listTips = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM tips ORDER BY created_at')
  res.json(rows)
})

export const createTip = asyncHandler(async (req, res) => {
  const { title, content, icon } = req.body
  if (!title || !content) throw new ApiError(400, 'Titre et contenu requis')
  const id = uuid()
  await pool.query('INSERT INTO tips (id, title, content, icon) VALUES (?, ?, ?, ?)', [
    id,
    title,
    content,
    icon || 'flame',
  ])
  res.status(201).json({ id })
})

export const updateTip = asyncHandler(async (req, res) => {
  const { title, content, icon } = req.body
  const fields = []
  const values = []
  if (title !== undefined) { fields.push('title = ?'); values.push(title) }
  if (content !== undefined) { fields.push('content = ?'); values.push(content) }
  if (icon !== undefined) { fields.push('icon = ?'); values.push(icon) }
  if (!fields.length) throw new ApiError(400, 'Aucune modification fournie')
  values.push(req.params.id)
  const [result] = await pool.query(`UPDATE tips SET ${fields.join(', ')} WHERE id = ?`, values)
  if (!result.affectedRows) throw new ApiError(404, 'Conseil introuvable')
  res.status(204).send()
})

export const deleteTip = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM tips WHERE id = ?', [req.params.id])
  if (!result.affectedRows) throw new ApiError(404, 'Conseil introuvable')
  res.status(204).send()
})

// --- Contenu du site (contact, textes) -----------------------------------
export const getSiteContent = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM site_contents')
  const map = {}
  for (const row of rows) map[row.key] = row.value
  res.json(map)
})

export const updateSiteContent = asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body || {})
  if (!entries.length) throw new ApiError(400, 'Aucune donnée fournie')
  for (const [key, value] of entries) {
    await pool.query(
      'INSERT INTO site_contents (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      [key, String(value)],
    )
  }
  res.status(204).send()
})
