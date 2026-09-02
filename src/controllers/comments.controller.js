import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { notifyAdmins } from '../utils/notify.js'

function mapComment(row, withUser = false) {
  const base = {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    isPublished: !!row.is_published,
    createdAt: row.created_at,
  }
  if (withUser) {
    base.clientName = `${row.first_name} ${row.last_name}`
    base.clientInitials = `${row.first_name[0]}${row.last_name[0]}`
  }
  return base
}

// POST /comments — le client envoie un commentaire à son coach (privé par défaut)
export const create = asyncHandler(async (req, res) => {
  const { content } = req.body
  if (!content?.trim()) throw new ApiError(400, 'Contenu requis')
  const id = uuid()
  await pool.query('INSERT INTO client_comments (id, user_id, content) VALUES (?, ?, ?)', [
    id,
    req.user.id,
    content.trim(),
  ])

  const [[user]] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [req.user.id])
  await notifyAdmins({
    type: 'message',
    title: 'Nouveau commentaire',
    body: `${user?.first_name ?? 'Un client'} a laissé un commentaire`,
    link: '/admin/commentaires',
  })

  res.status(201).json({ id })
})

// GET /admin/comments — tous les commentaires (admin)
export const listAll = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, u.first_name, u.last_name FROM client_comments c
     JOIN users u ON u.id = c.user_id ORDER BY c.created_at DESC`,
  )
  res.json(rows.map((r) => mapComment(r, true)))
})

// PUT /admin/comments/:id/publish — bascule publié/non publié
export const togglePublish = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT is_published FROM client_comments WHERE id = ?', [req.params.id])
  if (!rows[0]) throw new ApiError(404, 'Commentaire introuvable')
  const newValue = rows[0].is_published ? 0 : 1
  await pool.query('UPDATE client_comments SET is_published = ? WHERE id = ?', [newValue, req.params.id])
  res.json({ id: req.params.id, isPublished: !!newValue })
})

export const remove = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM client_comments WHERE id = ?', [req.params.id])
  if (!result.affectedRows) throw new ApiError(404, 'Commentaire introuvable')
  res.status(204).send()
})

// GET /comments/published — public, pour la page d'accueil
export const listPublished = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, u.first_name, u.last_name FROM client_comments c
     JOIN users u ON u.id = c.user_id WHERE c.is_published = 1 ORDER BY c.created_at DESC LIMIT 6`,
  )
  res.json(rows.map((r) => mapComment(r, true)))
})
