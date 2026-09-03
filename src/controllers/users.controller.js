import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { publicUrlFor } from '../middlewares/upload.middleware.js'
import { notifyAdmins } from '../utils/notify.js'
import { uploadBufferToCloudinary } from '../services/cloudinary.service.js'

export function toPublicUser(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    role: row.role,
    status: row.status,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
    subscriptionEnd: row.subscription_end,
    hasCompletedOnboarding: !!row.has_onboarded,
    heightCm: row.height_cm,
    goals: row.goals,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  }
}

const AVATAR_PALETTE = ['#3d7fff', '#c6ff3d', '#ff4423', '#8b96a5', '#ff8a3d']

// Convertit une date JavaScript/ISO en format DATETIME accepté par MySQL.
function toMySQLDateTime(value) {
  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'Date d’abonnement invalide')
  }

  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export const listUsers = asyncHandler(async (req, res) => {
  const role = req.query.role
  const params = []
  let sql = 'SELECT * FROM users'

  if (role) {
    sql += ' WHERE role = ?'
    params.push(role)
  }

  sql += ' ORDER BY created_at DESC'

  const [rows] = await pool.query(sql, params)

  res.json(rows.map(toPublicUser))
})

export const getUser = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [req.params.id],
  )

  if (!rows[0]) {
    throw new ApiError(404, 'Utilisateur introuvable')
  }

  res.json(toPublicUser(rows[0]))
})

// L'administrateur crée un compte client — pas d'auto-inscription.
export const createUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    role,
    subscriptionEnd,
  } = req.body

  if (!firstName || !lastName || !email || !password) {
    throw new ApiError(
      400,
      'Prénom, nom, email et mot de passe sont requis',
    )
  }

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE email = ?',
    [email],
  )

  if (existing.length) {
    throw new ApiError(
      409,
      'Un compte existe déjà avec cet email',
    )
  }

  const id = uuid()
  const passwordHash = await bcrypt.hash(password, 10)
  const avatarColor =
    AVATAR_PALETTE[
      Math.floor(Math.random() * AVATAR_PALETTE.length)
    ]

  // Conversion ISO → DATETIME MySQL
  const subscriptionEndDate = toMySQLDateTime(subscriptionEnd)

  await pool.query(
    `INSERT INTO users (
      id,
      first_name,
      last_name,
      email,
      password_hash,
      role,
      status,
      avatar_color,
      subscription_end
    )
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      id,
      firstName,
      lastName,
      email,
      passwordHash,
      role === 'admin' ? 'admin' : 'client',
      avatarColor,
      subscriptionEndDate,
    ],
  )

  // Notifier tous les admins qu'un nouveau client a été créé
  await notifyAdmins({
    type: 'new_client',
    title: 'Nouveau client',
    body: `${firstName} ${lastName} a été créé`,
  })

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ?',
    [id],
  )

  res.status(201).json(toPublicUser(rows[0]))
})

export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params

  const {
    firstName,
    lastName,
    email,
    status,
    subscriptionEnd,
    password,
    avatarUrl,
  } = req.body

  const fields = []
  const values = []

  if (firstName !== undefined) {
    fields.push('first_name = ?')
    values.push(firstName)
  }

  if (lastName !== undefined) {
    fields.push('last_name = ?')
    values.push(lastName)
  }

  if (email !== undefined) {
    fields.push('email = ?')
    values.push(email)
  }

  if (status !== undefined) {
    fields.push('status = ?')
    values.push(status)
  }

  if (subscriptionEnd !== undefined) {
    fields.push('subscription_end = ?')
    values.push(toMySQLDateTime(subscriptionEnd))
  }

  if (password) {
    fields.push('password_hash = ?')
    values.push(await bcrypt.hash(password, 10))
  }

  if (avatarUrl !== undefined) {
    fields.push('avatar_url = ?')
    values.push(avatarUrl || null)
  }

  if (fields.length === 0) {
    throw new ApiError(400, 'Aucune modification fournie')
  }

  values.push(id)

  const [result] = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    values,
  )

  if (result.affectedRows === 0) {
    throw new ApiError(404, 'Utilisateur introuvable')
  }

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ?',
    [id],
  )

  res.json(toPublicUser(rows[0]))
})

export const deleteUser = asyncHandler(async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM users WHERE id = ?',
    [req.params.id],
  )

  if (result.affectedRows === 0) {
    throw new ApiError(404, 'Utilisateur introuvable')
  }

  res.status(204).send()
})

// Statistiques d'activité d'un client pour le dashboard admin
export const getUserStats = asyncHandler(async (req, res) => {
  const { id } = req.params

  const [[loginRow]] = await pool.query(
    "SELECT COUNT(*) AS loginCount FROM activity_logs WHERE user_id = ? AND event_type = 'login'",
    [id],
  )

  const [[sessionsRow]] = await pool.query(
    `SELECT
       COUNT(*) AS totalSessions,
       SUM(status = 'completed') AS completedSessions,
       SUM(TIMESTAMPDIFF(MINUTE, started_at, ended_at)) AS trainingMinutes
     FROM workout_sessions
     WHERE user_id = ?`,
    [id],
  )

  const [[heartbeatRow]] = await pool.query(
    "SELECT COUNT(*) AS heartbeats FROM activity_logs WHERE user_id = ? AND event_type = 'heartbeat'",
    [id],
  )

  const [[plannedRow]] = await pool.query(
    `SELECT
       SUM(status = 'planned') AS planned,
       SUM(status = 'done') AS done,
       SUM(status = 'missed') AS missed
     FROM planned_sessions
     WHERE user_id = ?`,
    [id],
  )

  const [weeksRows] = await pool.query(
    `SELECT
       w.id AS week_id,
       w.number AS week_number,
       w.title AS week_title,
       w.is_locked AS template_locked,
       p.id AS program_id,
       p.title AS program_title,
       p.type AS program_type,
       p.is_locked AS program_template_locked,
       uwa.is_unlocked AS user_unlocked,
       uwa.unlocked_at,
       uwa.completed_at
     FROM weeks w
     JOIN programs p
       ON p.id = w.program_id
       AND p.is_active = 1
     LEFT JOIN user_week_access uwa
       ON uwa.week_id = w.id
       AND uwa.user_id = ?
     ORDER BY p.display_order, w.number`,
    [id],
  )

  const weeks = weeksRows.map((r) => {
    let isUnlocked = false

    if (
      r.user_unlocked !== null &&
      r.user_unlocked !== undefined
    ) {
      isUnlocked = !!r.user_unlocked
    } else if (r.week_number === 1) {
      isUnlocked = true
    } else {
      isUnlocked = !r.template_locked
    }

    return {
      weekId: r.week_id,
      weekNumber: r.week_number,
      weekTitle:
        r.week_title || `Semaine ${r.week_number}`,
      programId: r.program_id,
      programTitle: r.program_title,
      programType: r.program_type,
      isUnlocked,
      isCompleted: !!r.completed_at,
      unlockedAt: r.unlocked_at,
      completedAt: r.completed_at,
    }
  })

  const [progRows] = await pool.query(
    `SELECT
       p.id,
       p.title,
       p.type,
       p.is_locked AS template_locked,
       p.unlock_after_program_id,
       upa.is_unlocked AS user_unlocked
     FROM programs p
     LEFT JOIN user_program_access upa
       ON upa.program_id = p.id
       AND upa.user_id = ?
     WHERE p.is_active = 1
     ORDER BY p.display_order`,
    [id],
  )

  const programs = []

  for (const r of progRows) {
    let isUnlocked = false

    if (
      r.user_unlocked !== null &&
      r.user_unlocked !== undefined
    ) {
      isUnlocked = !!r.user_unlocked
    } else if (r.template_locked) {
      isUnlocked = false
    } else if (r.unlock_after_program_id) {
      const [[done]] = await pool.query(
        `SELECT
           (SELECT COUNT(*)
            FROM workout_days wd
            JOIN weeks w ON w.id = wd.week_id
            WHERE w.program_id = ?) AS total_days,

           (SELECT COUNT(DISTINCT ws.day_id)
            FROM workout_sessions ws
            JOIN workout_days wd ON wd.id = ws.day_id
            JOIN weeks w ON w.id = wd.week_id
            WHERE w.program_id = ?
              AND ws.user_id = ?
              AND ws.status = 'completed') AS done_days`,
        [
          r.unlock_after_program_id,
          r.unlock_after_program_id,
          id,
        ],
      )

      isUnlocked =
        done.total_days > 0 &&
        done.done_days >= done.total_days
    } else {
      isUnlocked = true
    }

    programs.push({
      programId: r.id,
      title: r.title,
      type: r.type,
      isUnlocked,
    })
  }

  const [[lastAct]] = await pool.query(
    `SELECT ended_at, started_at
     FROM workout_sessions
     WHERE user_id = ?
       AND status = 'completed'
     ORDER BY COALESCE(ended_at, started_at) DESC
     LIMIT 1`,
    [id],
  )

  const [[nextPlan]] = await pool.query(
    `SELECT title, scheduled_date, scheduled_time, status
     FROM planned_sessions
     WHERE user_id = ?
       AND status = 'planned'
       AND scheduled_date >= CURDATE()
     ORDER BY scheduled_date, scheduled_time
     LIMIT 1`,
    [id],
  )

  const unlockedWeeks = weeks.filter(
    (w) => w.isUnlocked,
  )

  const currentWeek = unlockedWeeks.length
    ? unlockedWeeks.reduce((a, b) =>
        a.weekNumber >= b.weekNumber ? a : b,
      )
    : null

  res.json({
    userId: id,
    loginCount: loginRow.loginCount,
    totalSessions: sessionsRow.totalSessions || 0,
    completedSessions:
      Number(sessionsRow.completedSessions) || 0,
    trainingMinutes:
      Number(sessionsRow.trainingMinutes) || 0,
    activeMinutesEstimate:
      heartbeatRow.heartbeats,
    plannedCount:
      Number(plannedRow.planned) || 0,
    plannedDone:
      Number(plannedRow.done) || 0,
    plannedMissed:
      Number(plannedRow.missed) || 0,
    weeks,
    programs,
    currentWeek,
    weeksCompleted:
      weeks.filter((w) => w.isCompleted).length,
    weeksUnlocked:
      weeks.filter((w) => w.isUnlocked).length,
    lastActivityAt:
      lastAct?.ended_at ||
      lastAct?.started_at ||
      null,
    nextPlanned: nextPlan
      ? {
          title: nextPlan.title,
          date: nextPlan.scheduled_date,
          time: nextPlan.scheduled_time,
        }
      : null,
  })
})

export const uploadUserAvatar = asyncHandler(
  async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, 'Aucune image reçue')
    }

    let url

    if (process.env.NODE_ENV === 'production') {
      const result = await uploadBufferToCloudinary(
        req.file.buffer,
        'avatars',
      )

      url = result.secure_url
    } else {
      url = publicUrlFor(
        'avatars',
        req.file.filename,
      )
    }

    await pool.query(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [url, req.params.id],
    )

    res.json({ avatarUrl: url })
  },
)

/**
 * GET /admin/users/dashboard-stats
 * Stats globales + détail des séances terminées + progression par client.
 */
export const getDashboardStats = asyncHandler(
  async (req, res) => {
    // Clients actifs
    const [[clientCount]] = await pool.query(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'client' AND status = 'active'",
    )

    // Séances terminées
    const [[sessionStats]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'completed') AS completed,
         SUM(
           status = 'completed'
           AND DATE(ended_at) = CURDATE()
         ) AS completed_today
       FROM workout_sessions`,
    )

    // Séances planifiées
    const [[plannedStats]] = await pool.query(
      `SELECT
         SUM(status = 'planned') AS planned,
         SUM(status = 'done') AS done,
         SUM(status = 'missed') AS missed,
         SUM(
           status = 'planned'
           AND scheduled_date = CURDATE()
         ) AS planned_today
       FROM planned_sessions`,
    )

    // Détail des séances terminées
    const [completedRows] = await pool.query(
      `SELECT
         ws.id AS session_id,
         ws.user_id,
         ws.day_id,
         ws.started_at,
         ws.ended_at,
         ws.status,
         u.first_name,
         u.last_name,
         wd.title AS day_title,
         wd.day_number,
         w.number AS week_number,
         w.title AS week_title,
         w.id AS week_id,
         p.id AS program_id,
         p.title AS program_title,
         p.type AS program_type
       FROM workout_sessions ws
       JOIN users u ON u.id = ws.user_id
       JOIN workout_days wd ON wd.id = ws.day_id
       JOIN weeks w ON w.id = wd.week_id
       JOIN programs p ON p.id = w.program_id
       WHERE ws.status = 'completed'
       ORDER BY COALESCE(ws.ended_at, ws.started_at) DESC
       LIMIT 100`,
    )

    const completedSessions =
      completedRows.map((r) => ({
        sessionId: r.session_id,
        userId: r.user_id,
        clientName:
          `${r.first_name} ${r.last_name}`,
        dayId: r.day_id,
        dayTitle: r.day_title,
        dayNumber: r.day_number,
        weekId: r.week_id,
        weekNumber: r.week_number,
        weekTitle:
          r.week_title ||
          `Semaine ${r.week_number}`,
        programId: r.program_id,
        programTitle: r.program_title,
        programType: r.program_type,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        status: r.status,
      }))

    // Progression par client
    const [clients] = await pool.query(
      "SELECT id, first_name, last_name, email, avatar_color, avatar_url, last_login_at, subscription_end, status FROM users WHERE role = 'client' ORDER BY last_name, first_name",
    )

    const clientProgress = []

    for (const c of clients) {
      const [[sess]] = await pool.query(
        `SELECT
           COUNT(*) AS total,
           SUM(status = 'completed') AS completed
         FROM workout_sessions
         WHERE user_id = ?`,
        [c.id],
      )

      const [[planned]] = await pool.query(
        `SELECT
           SUM(status = 'planned') AS planned,
           SUM(status = 'done') AS done,
           SUM(status = 'missed') AS missed
         FROM planned_sessions
         WHERE user_id = ?`,
        [c.id],
      )

      const [[weekProg]] = await pool.query(
        `SELECT
           SUM(is_unlocked = 1) AS unlocked,
           SUM(completed_at IS NOT NULL) AS completed_weeks
         FROM user_week_access
         WHERE user_id = ?`,
        [c.id],
      )

      const [[currentWeek]] = await pool.query(
        `SELECT
           w.number,
           w.title,
           p.title AS program_title
         FROM user_week_access uwa
         JOIN weeks w ON w.id = uwa.week_id
         JOIN programs p ON p.id = w.program_id
         WHERE uwa.user_id = ?
           AND uwa.is_unlocked = 1
         ORDER BY w.number DESC
         LIMIT 1`,
        [c.id],
      )

      const [[lastAct]] = await pool.query(
        `SELECT ended_at, started_at
         FROM workout_sessions
         WHERE user_id = ?
           AND status = 'completed'
         ORDER BY COALESCE(ended_at, started_at) DESC
         LIMIT 1`,
        [c.id],
      )

      const [[nextPlan]] = await pool.query(
        `SELECT title, scheduled_date, scheduled_time
         FROM planned_sessions
         WHERE user_id = ?
           AND status = 'planned'
           AND scheduled_date >= CURDATE()
         ORDER BY scheduled_date, scheduled_time
         LIMIT 1`,
        [c.id],
      )

      const [[progAccess]] = await pool.query(
        `SELECT SUM(is_unlocked = 1) AS unlocked
         FROM user_program_access
         WHERE user_id = ?`,
        [c.id],
      )

      const completed =
        Number(sess.completed) || 0

      const total =
        Number(sess.total) || 0

      clientProgress.push({
        userId: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        avatarColor: c.avatar_color,
        avatarUrl: c.avatar_url,
        lastLoginAt: c.last_login_at,
        subscriptionEnd: c.subscription_end,
        status: c.status,
        sessionsCompleted: completed,
        sessionsTotal: total,
        plannedCount:
          Number(planned.planned) || 0,
        plannedDone:
          Number(planned.done) || 0,
        plannedMissed:
          Number(planned.missed) || 0,
        weeksUnlocked:
          Number(weekProg.unlocked) || 0,
        weeksCompleted:
          Number(weekProg.completed_weeks) || 0,
        currentWeekNumber:
          currentWeek?.number ?? null,
        currentWeekTitle:
          currentWeek?.title ||
          (
            currentWeek
              ? `Semaine ${currentWeek.number}`
              : null
          ),
        currentProgramTitle:
          currentWeek?.program_title ?? null,
        lastActivityAt:
          lastAct?.ended_at ||
          lastAct?.started_at ||
          null,
        nextPlannedTitle:
          nextPlan?.title ?? null,
        nextPlannedDate:
          nextPlan?.scheduled_date ?? null,
        programsUnlocked:
          Number(progAccess.unlocked) || 0,
      })
    }

    res.json({
      summary: {
        activeClients: clientCount.n,
        sessionsTotal:
          Number(sessionStats.total) || 0,
        sessionsCompleted:
          Number(sessionStats.completed) || 0,
        sessionsCompletedToday:
          Number(sessionStats.completed_today) || 0,
        planned:
          Number(plannedStats.planned) || 0,
        plannedDone:
          Number(plannedStats.done) || 0,
        plannedMissed:
          Number(plannedStats.missed) || 0,
        plannedToday:
          Number(plannedStats.planned_today) || 0,
      },
      completedSessions,
      clientProgress,
    })
  },
)

