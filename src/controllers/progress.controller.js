import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'

// --- Poids corporel -------------------------------------------------------
export const listWeight = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, weight, recorded_at FROM body_measurements WHERE user_id = ? ORDER BY recorded_at',
    [req.params.userId],
  )
  res.json(rows.map((r) => ({ id: r.id, weight: Number(r.weight), recordedAt: r.recorded_at })))
})

export const addWeight = asyncHandler(async (req, res) => {
  const { weight } = req.body
  if (!weight) throw new ApiError(400, 'Poids requis')
  const id = uuid()
  await pool.query('INSERT INTO body_measurements (id, user_id, weight) VALUES (?, ?, ?)', [
    id,
    req.params.userId,
    weight,
  ])
  res.status(201).json({ id })
})

// --- Bloc-notes personnel — historique conservé, jamais écrasé ------------
// NB : ces notes sont consultables par le coach/admin (l'UI le précise au client).
export const listNotes = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC', [
    req.params.userId,
  ])
  res.json(rows.map((r) => ({ id: r.id, userId: r.user_id, content: r.content, createdAt: r.created_at })))
})

export const addNote = asyncHandler(async (req, res) => {
  const { content } = req.body
  if (!content?.trim()) throw new ApiError(400, 'Contenu requis')
  const id = uuid()
  await pool.query('INSERT INTO notes (id, user_id, content) VALUES (?, ?, ?)', [id, req.params.userId, content.trim()])
  const [[row]] = await pool.query('SELECT * FROM notes WHERE id = ?', [id])
  res.status(201).json({ id: row.id, userId: row.user_id, content: row.content, createdAt: row.created_at })
})

// --- Journal d'entraînement structuré (tableau type Excel) ---------------
function mapExerciseLog(row) {
  const first = row.first_weight !== null ? Number(row.first_weight) : null
  const last = row.last_weight !== null ? Number(row.last_weight) : null
  const volume = last !== null && row.reps && row.sets ? Math.round(last * row.reps * row.sets) : null
  const progressionPct = first && last && first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0
  return {
    id: row.id,
    userId: row.user_id,
    logDate: row.log_date,
    exerciseName: row.exercise_name,
    firstWeight: first,
    lastWeight: last,
    reps: row.reps,
    sets: row.sets,
    volume,
    progressionPct,
    comment: row.comment,
  }
}

export const listExerciseLog = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM exercise_logs WHERE user_id = ? ORDER BY log_date DESC, created_at DESC', [
    req.params.userId,
  ])
  res.json(rows.map(mapExerciseLog))
})

export const addExerciseLog = asyncHandler(async (req, res) => {
  const { logDate, exerciseName, firstWeight, lastWeight, reps, sets, comment } = req.body
  if (!logDate || !exerciseName) throw new ApiError(400, 'logDate et exerciseName sont requis')
  const id = uuid()
  await pool.query(
    `INSERT INTO exercise_logs (id, user_id, log_date, exercise_name, first_weight, last_weight, reps, sets, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.userId, logDate, exerciseName, firstWeight ?? null, lastWeight ?? null, reps ?? null, sets ?? null, comment || null],
  )
  const [[row]] = await pool.query('SELECT * FROM exercise_logs WHERE id = ?', [id])
  res.status(201).json(mapExerciseLog(row))
})

export const removeExerciseLog = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM exercise_logs WHERE id = ?', [req.params.id])
  if (!result.affectedRows) throw new ApiError(404, 'Entrée introuvable')
  res.status(204).send()
})
