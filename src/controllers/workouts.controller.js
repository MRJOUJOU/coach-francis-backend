import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { notifyAdmins } from '../utils/notify.js'
import { handleWeekProgression } from './programs.controller.js'

function mapSession(row) {
  return {
    id: row.id,
    userId: row.user_id,
    dayId: row.day_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    clientRemark: row.client_remark,
  }
}

// Regroupe les lignes "une par série" en un objet exercice { exerciseId, sets: [...] }
function groupSetsByExercise(setRows) {
  const map = new Map()
  for (const row of setRows) {
    if (!map.has(row.exercise_id)) map.set(row.exercise_id, [])
    map.get(row.exercise_id).push({
      setNumber: row.set_number,
      weight: row.weight,
      reps: row.reps,
      done: !!row.done,
    })
  }
  return map
}

async function loadSessionWithDetail(sessionId) {
  const [[session]] = await pool.query('SELECT * FROM workout_sessions WHERE id = ?', [sessionId])
  if (!session) return null
  const [setRows] = await pool.query(
    'SELECT * FROM exercise_performances WHERE session_id = ? ORDER BY exercise_id, set_number',
    [sessionId],
  )
  const [noteRows] = await pool.query('SELECT * FROM exercise_reports WHERE session_id = ?', [sessionId])
  const setsByExercise = groupSetsByExercise(setRows)
  const notesByExercise = new Map(noteRows.map((n) => [n.exercise_id, n]))

  const exerciseIds = new Set([...setsByExercise.keys(), ...notesByExercise.keys()])
  const performances = [...exerciseIds].map((exerciseId) => {
    const sets = setsByExercise.get(exerciseId) ?? []
    const note = notesByExercise.get(exerciseId)
    return {
      exerciseId,
      sets,
      done: sets.length > 0 && sets.every((s) => s.done),
      difficulty: note?.difficulty ?? null,
      comment: note?.comment ?? null,
    }
  })

  return { ...mapSession(session), performances }
}

// POST /workouts/start
export const startSession = asyncHandler(async (req, res) => {
  const { dayId } = req.body
  if (!dayId) throw new ApiError(400, 'dayId requis')
  const id = uuid()
  await pool.query('INSERT INTO workout_sessions (id, user_id, day_id) VALUES (?, ?, ?)', [id, req.user.id, dayId])
  await pool.query('INSERT INTO activity_logs (id, user_id, event_type, meta) VALUES (?, ?, ?, ?)', [
    uuid(),
    req.user.id,
    'session_start',
    JSON.stringify({ dayId, sessionId: id }),
  ])
  res.status(201).json(await loadSessionWithDetail(id))
})

// GET /workouts/last-performance/:exerciseId
// Renvoie la meilleure série de la dernière séance terminée où cet exercice a été fait.
export const getLastPerformance = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ep.* FROM exercise_performances ep
     JOIN workout_sessions ws ON ws.id = ep.session_id
     WHERE ws.user_id = ? AND ep.exercise_id = ? AND ws.status = 'completed' AND ep.done = 1
     ORDER BY ws.started_at DESC, ep.weight DESC LIMIT 1`,
    [req.user.id, req.params.exerciseId],
  )
  if (!rows[0]) return res.json(null)
  const r = rows[0]
  res.json({ weight: r.weight, reps: r.reps, setNumber: r.set_number })
})

// Meilleur poids jamais réalisé pour un exercice, pour détecter un nouveau record
async function getPersonalBest(userId, exerciseId, excludeSessionId) {
  const [rows] = await pool.query(
    `SELECT MAX(CAST(ep.weight AS DECIMAL(10,2))) AS best FROM exercise_performances ep
     JOIN workout_sessions ws ON ws.id = ep.session_id
     WHERE ws.user_id = ? AND ep.exercise_id = ? AND ep.done = 1 AND ws.id != ?
       AND ep.weight REGEXP '^[0-9]+(\\.[0-9]+)?'`,
    [userId, exerciseId, excludeSessionId],
  )
  return rows[0]?.best ? Number(rows[0].best) : null
}

// POST /workouts/:sessionId/report
// body: { sets: [{exerciseId, setNumber, weight, reps, done}], exerciseNotes: [{exerciseId, difficulty, comment}], clientRemark }
export const submitReport = asyncHandler(async (req, res) => {
  const { sessionId } = req.params
  const { sets, exerciseNotes, clientRemark } = req.body
  if (!Array.isArray(sets)) throw new ApiError(400, 'sets doit être un tableau')

  const [sessionRows] = await pool.query('SELECT * FROM workout_sessions WHERE id = ?', [sessionId])
  const session = sessionRows[0]
  if (!session) throw new ApiError(404, 'Séance introuvable')
  if (session.user_id !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, "Cette séance ne t'appartient pas")
  }

  // Purge d'éventuelles données partielles déjà enregistrées pour cette séance
  await pool.query('DELETE FROM exercise_performances WHERE session_id = ?', [sessionId])
  await pool.query('DELETE FROM exercise_reports WHERE session_id = ?', [sessionId])

  for (const s of sets) {
    await pool.query(
      `INSERT INTO exercise_performances (id, session_id, exercise_id, set_number, weight, reps, done)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), sessionId, s.exerciseId, s.setNumber || 1, s.weight || null, s.reps || null, s.done ? 1 : 0],
    )
  }
  for (const n of exerciseNotes || []) {
    await pool.query(
      `INSERT INTO exercise_reports (id, session_id, exercise_id, difficulty, comment) VALUES (?, ?, ?, ?, ?)`,
      [uuid(), sessionId, n.exerciseId, n.difficulty || null, n.comment || null],
    )
  }

  await pool.query("UPDATE workout_sessions SET status = 'completed', ended_at = NOW(), client_remark = ? WHERE id = ?", [
    clientRemark || null,
    sessionId,
  ])
  await pool.query('INSERT INTO activity_logs (id, user_id, event_type, meta) VALUES (?, ?, ?, ?)', [
    uuid(),
    session.user_id,
    'session_end',
    JSON.stringify({ sessionId }),
  ])

  // Progression automatique des semaines (déblocage / génération)
  try {
    await handleWeekProgression(session.user_id, session.day_id)
  } catch (err) {
    console.error('handleWeekProgression failed:', err.message)
  }

  // --- Calcul du résumé de séance (source unique de vérité, rien de dupliqué) ---
  const [[day]] = await pool.query('SELECT title FROM workout_days WHERE id = ?', [session.day_id])
  const [[exerciseCountRow]] = await pool.query('SELECT COUNT(*) AS total FROM exercises WHERE day_id = ?', [session.day_id])
  const totalExercises = exerciseCountRow.total

  const doneSets = sets.filter((s) => s.done)
  const totalSets = sets.length
  const completedSets = doneSets.length
  const exercisesCompleted = new Set(
    Object.entries(
      sets.reduce((acc, s) => {
        acc[s.exerciseId] = acc[s.exerciseId] ?? []
        acc[s.exerciseId].push(s.done)
        return acc
      }, {}),
    )
      .filter(([, arr]) => arr.length > 0 && arr.every(Boolean))
      .map(([exerciseId]) => exerciseId),
  ).size

  let totalVolume = 0
  for (const s of doneSets) {
    const w = parseFloat(s.weight)
    const r = parseInt(s.reps)
    if (!isNaN(w) && !isNaN(r)) totalVolume += w * r
  }

  const records = []
  const exerciseIdsInvolved = [...new Set(doneSets.map((s) => s.exerciseId))]
  for (const exerciseId of exerciseIdsInvolved) {
    const bestThisSession = Math.max(
      ...doneSets.filter((s) => s.exerciseId === exerciseId).map((s) => parseFloat(s.weight) || 0),
    )
    const previousBest = await getPersonalBest(session.user_id, exerciseId, sessionId)
    if (bestThisSession > 0 && (previousBest === null || bestThisSession > previousBest)) {
      const [[exo]] = await pool.query('SELECT name FROM exercises WHERE id = ?', [exerciseId])
      records.push({ exerciseId, exerciseName: exo?.name ?? 'Exercice', weight: bestThisSession })
    }
  }

  const durationMinutes = session.started_at
    ? Math.max(1, Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000))
    : null

  const summary = {
    dayTitle: day?.title ?? 'Séance',
    durationMinutes,
    exercisesCompleted,
    totalExercises,
    setsCompleted: completedSets,
    totalSets,
    totalVolume: Math.round(totalVolume),
    records,
  }

  // Notifier les admins avec un résumé exploitable
  const [[user]] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [session.user_id])
  const recordText = records.length ? ` — nouveau record : ${records[0].exerciseName} ${records[0].weight}kg` : ''
  await notifyAdmins({
    type: 'report',
    title: 'Rapport reçu',
    body: `${user?.first_name ?? 'Un client'} ${user?.last_name ?? ''} a terminé "${day?.title ?? 'sa séance'}"${recordText}`,
    link: '/admin/rapports',
  })

  res.json({ session: await loadSessionWithDetail(sessionId), summary })
})

// GET /workouts/user/:userId
export const listSessionsForUser = asyncHandler(async (req, res) => {
  const [sessions] = await pool.query('SELECT * FROM workout_sessions WHERE user_id = ? ORDER BY started_at DESC', [
    req.params.userId,
  ])
  const result = []
  for (const s of sessions) result.push(await loadSessionWithDetail(s.id))
  res.json(result)
})

// GET /admin/workouts — toutes les séances (admin)
export const listAllSessions = asyncHandler(async (req, res) => {
  const [sessions] = await pool.query('SELECT * FROM workout_sessions ORDER BY started_at DESC LIMIT 200')
  const result = []
  for (const s of sessions) result.push(await loadSessionWithDetail(s.id))
  res.json(result)
})

// POST /activity/heartbeat
export const heartbeat = asyncHandler(async (req, res) => {
  await pool.query("INSERT INTO activity_logs (id, user_id, event_type) VALUES (?, ?, 'heartbeat')", [
    uuid(),
    req.user.id,
  ])
  res.status(204).send()
})
