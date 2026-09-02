import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { publicUrlFor } from '../middlewares/upload.middleware.js'
import { uploadBufferToCloudinary } from '../services/cloudinary.service.js'

export const createExercise = asyncHandler(async (req, res) => {
  const { dayId } = req.params
  const { name, description, imageUrl, sets, reps, duration, recommendedWeight, order } = req.body
  if (!name) throw new ApiError(400, "Le nom de l'exercice est requis")

  const id = uuid()
  await pool.query(
    `INSERT INTO exercises (id, day_id, name, description, image_url, sets, reps, duration, recommended_weight, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, dayId, name, description || null, imageUrl || null, sets || 3, reps || null, duration || null, recommendedWeight || null, order ?? 0],
  )
  res.status(201).json({ id })
})

const editableFields = {
  name: 'name',
  description: 'description',
  imageUrl: 'image_url',
  sets: 'sets',
  reps: 'reps',
  duration: 'duration',
  recommendedWeight: 'recommended_weight',
  order: 'display_order',
}

export const updateExercise = asyncHandler(async (req, res) => {
  const fields = []
  const values = []
  for (const [key, column] of Object.entries(editableFields)) {
    if (req.body[key] !== undefined) {
      fields.push(`${column} = ?`)
      values.push(req.body[key])
    }
  }
  if (!fields.length) throw new ApiError(400, 'Aucune modification fournie')
  values.push(req.params.id)
  const [result] = await pool.query(`UPDATE exercises SET ${fields.join(', ')} WHERE id = ?`, values)
  if (!result.affectedRows) throw new ApiError(404, 'Exercice introuvable')
  res.status(204).send()
})

export const deleteExercise = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM exercises WHERE id = ?', [req.params.id])
  if (!result.affectedRows) throw new ApiError(404, 'Exercice introuvable')
  res.status(204).send()
})

export const reorderExercises = asyncHandler(async (req, res) => {
  const { orderedIds } = req.body
  if (!Array.isArray(orderedIds)) throw new ApiError(400, 'orderedIds doit être un tableau')
  await Promise.all(
    orderedIds.map((id, index) => pool.query('UPDATE exercises SET display_order = ? WHERE id = ?', [index, id])),
  )
  res.status(204).send()
})

export const uploadExerciseImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Aucune image reçue')
  }

  let url

  if (process.env.NODE_ENV === 'production') {
    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      'exercises'
    )

    url = result.secure_url
  } else {
    url = publicUrlFor('exercises', req.file.filename)
  }

  await pool.query(
    'UPDATE exercises SET image_url = ? WHERE id = ?',
    [url, req.params.id]
  )

  res.json({ imageUrl: url })
})
