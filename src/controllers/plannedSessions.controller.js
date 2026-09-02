import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { notifyUser } from '../utils/notify.js'
import { publicUrlFor } from '../middlewares/upload.middleware.js'
import { uploadBufferToCloudinary } from '../services/cloudinary.service.js'

const ACTIVITY_TYPES = [
  'cardio_velo',
  'course',
  'pieds',
  'stretching',
  'mobilite',
  'renforcement',
  'rotation',
  'autre',
]

function mapPlanned(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    activityType: row.activity_type || null,
    notes: row.notes,
    imageUrl: row.image_url || null,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    status: row.status,
    notified: !!row.notified,
    createdAt: row.created_at,
  }
}

// GET /planned-sessions/:userId
export const listForUser = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM planned_sessions WHERE user_id = ? ORDER BY scheduled_date DESC, scheduled_time',
    [req.params.userId],
  )
  res.json(rows.map(mapPlanned))
})

// POST /planned-sessions/:userId
export const create = asyncHandler(async (req, res) => {
  const { title, notes, scheduledDate, scheduledTime, activityType, imageUrl, status } = req.body
  if (!title || !scheduledDate) throw new ApiError(400, 'title et scheduledDate sont requis')

  const type = activityType && ACTIVITY_TYPES.includes(activityType) ? activityType : (activityType || null)

  const id = uuid()
  await pool.query(
    `INSERT INTO planned_sessions (id, user_id, title, activity_type, notes, image_url, scheduled_date, scheduled_time, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.params.userId,
      title,
      type,
      notes || null,
      imageUrl || null,
      scheduledDate,
      scheduledTime || null,
      status === 'done' || status === 'missed' ? status : 'planned',
    ],
  )
  const [[row]] = await pool.query('SELECT * FROM planned_sessions WHERE id = ?', [id])

  // Notification à la création + rappel immédiat si c'est aujourd'hui
  const isToday = String(scheduledDate).slice(0, 10) === new Date().toISOString().slice(0, 10)
  try {
    if (isToday) {
      await notifyUser(req.params.userId, {
        type: 'reminder',
        title: "Séance prévue aujourd'hui",
        body: `${title} — Vous aviez prévu cette séance aujourd'hui. Ouvrez « Ma planification » pour la marquer comme faite.`,
        link: `/client/planification?highlight=${id}`,
      })
      await pool.query('UPDATE planned_sessions SET notified = 1 WHERE id = ?', [id])
    } else {
      await notifyUser(req.params.userId, {
        type: 'reminder',
        title: 'Séance planifiée',
        body: `${title} prévue le ${scheduledDate}. Vous serez rappelé le jour J.`,
        link: `/client/planification?highlight=${id}`,
      })
    }
  } catch (e) {
    console.error('notify planned create:', e.message)
  }

  res.status(201).json(mapPlanned(row))
})

// PUT /planned-sessions/item/:id
export const update = asyncHandler(async (req, res) => {
  const { title, notes, scheduledDate, scheduledTime, status, activityType, imageUrl } = req.body
  const fields = []
  const values = []
  if (title !== undefined) { fields.push('title = ?'); values.push(title) }
  if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
  if (scheduledDate !== undefined) { fields.push('scheduled_date = ?'); values.push(scheduledDate) }
  if (scheduledTime !== undefined) { fields.push('scheduled_time = ?'); values.push(scheduledTime) }
  if (status !== undefined) { fields.push('status = ?'); values.push(status) }
  if (activityType !== undefined) { fields.push('activity_type = ?'); values.push(activityType || null) }
  if (imageUrl !== undefined) { fields.push('image_url = ?'); values.push(imageUrl || null) }
  // Si la date change, on réarme la notification
  if (scheduledDate !== undefined) { fields.push('notified = 0') }
  if (!fields.length) throw new ApiError(400, 'Aucune modification fournie')

  values.push(req.params.id)
  const [result] = await pool.query(`UPDATE planned_sessions SET ${fields.join(', ')} WHERE id = ?`, values)
  if (!result.affectedRows) throw new ApiError(404, 'Séance planifiée introuvable')

  const [[row]] = await pool.query('SELECT * FROM planned_sessions WHERE id = ?', [req.params.id])
  res.json(mapPlanned(row))
})

export const remove = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM planned_sessions WHERE id = ?', [req.params.id])
  if (!result.affectedRows) throw new ApiError(404, 'Séance planifiée introuvable')
  res.status(204).send()
})

// GET /planned-sessions/admin/today — séances du jour (admin)
export const listTodayAdmin = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ps.*, u.first_name, u.last_name
     FROM planned_sessions ps
     JOIN users u ON u.id = ps.user_id
     WHERE ps.scheduled_date = CURDATE()
     ORDER BY ps.scheduled_time`,
  )
  res.json(
    rows.map((r) => ({
      ...mapPlanned(r),
      clientName: `${r.first_name} ${r.last_name}`,
    })),
  )
})


/** POST /planned-sessions/upload-image — upload générique (retourne imageUrl) */
export const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Aucune image reçue')
  }

  let url

  if (process.env.NODE_ENV === 'production') {
    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      'planned'
    )

    url = result.secure_url
  } else {
    url = publicUrlFor('planned', req.file.filename)
  }

  res.json({ imageUrl: url })
})