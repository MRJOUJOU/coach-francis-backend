import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { publicUrlFor } from '../middlewares/upload.middleware.js'
import { uploadBufferToCloudinary } from '../services/cloudinary.service.js'

export const createDay = asyncHandler(async (req, res) => {
  const { weekId } = req.params
  const { dayNumber, title, subtitle, description, imageUrl, category, isOptional, order } = req.body
  if (!title || !dayNumber) throw new ApiError(400, 'Titre et numéro de jour requis')

  const id = uuid()
  await pool.query(
    `INSERT INTO workout_days (id, week_id, day_number, title, subtitle, description, image_url, category, display_order, is_optional)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      weekId,
      dayNumber,
      title,
      subtitle || null,
      description || null,
      imageUrl || null,
      category || 'strength',
      order ?? dayNumber,
      isOptional ? 1 : 0,
    ],
  )
  res.status(201).json({ id })
})

const editableFields = {
  title: 'title',
  subtitle: 'subtitle',
  description: 'description',
  imageUrl: 'image_url',
  summaryImageUrl: 'summary_image_url',
  category: 'category',
  status: 'status',
  order: 'display_order',
  isOptional: 'is_optional',
}

export const updateDay = asyncHandler(async (req, res) => {
  const fields = []
  const values = []
  for (const [key, column] of Object.entries(editableFields)) {
    if (req.body[key] !== undefined) {
      fields.push(`${column} = ?`)
      values.push(key === 'isOptional' ? (req.body[key] ? 1 : 0) : req.body[key])
    }
  }
  if (!fields.length) throw new ApiError(400, 'Aucune modification fournie')
  values.push(req.params.id)
  const [result] = await pool.query(`UPDATE workout_days SET ${fields.join(', ')} WHERE id = ?`, values)
  if (!result.affectedRows) throw new ApiError(404, 'Jour introuvable')
  res.status(204).send()
})

export const deleteDay = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM workout_days WHERE id = ?', [req.params.id])
  if (!result.affectedRows) throw new ApiError(404, 'Jour introuvable')
  res.status(204).send()
})

export const reorderDays = asyncHandler(async (req, res) => {
  const { orderedIds } = req.body // tableau d'IDs dans le nouvel ordre
  if (!Array.isArray(orderedIds)) throw new ApiError(400, 'orderedIds doit être un tableau')
  await Promise.all(
    orderedIds.map((id, index) => pool.query('UPDATE workout_days SET display_order = ? WHERE id = ?', [index, id])),
  )
  res.status(204).send()
})

export const uploadDayImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Aucune image reçue')
  }

  let url

  if (process.env.NODE_ENV === 'production') {
    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      'days'
    )

    url = result.secure_url
  } else {
    url = publicUrlFor('days', req.file.filename)
  }

  await pool.query(
    'UPDATE workout_days SET image_url = ? WHERE id = ?',
    [url, req.params.id]
  )

  res.json({ imageUrl: url })
})
// Grande image récapitulative de la journée (distincte de l'image principale) —
// aucun recadrage forcé côté serveur, la contrainte de ratio est purement visuelle côté frontend.
export const uploadDaySummaryImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Aucune image reçue')
  }

  let url

  if (process.env.NODE_ENV === 'production') {
    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      'days'
    )

    url = result.secure_url
  } else {
    url = publicUrlFor('days', req.file.filename)
  }

  await pool.query(
    'UPDATE workout_days SET summary_image_url = ? WHERE id = ?',
    [url, req.params.id]
  )

  res.json({ summaryImageUrl: url })
})

export const removeDaySummaryImage = asyncHandler(async (req, res) => {
  await pool.query('UPDATE workout_days SET summary_image_url = NULL WHERE id = ?', [req.params.id])
  res.status(204).send()
})
