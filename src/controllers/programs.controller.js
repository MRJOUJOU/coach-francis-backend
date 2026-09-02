import { v4 as uuid } from 'uuid'
import { pool } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'

function mapExercise(row) {
  return {
    id: row.id,
    dayId: row.day_id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    sets: row.sets,
    reps: row.reps,
    duration: row.duration,
    recommendedWeight: row.recommended_weight,
    order: row.display_order,
  }
}

function mapDay(row) {
  return {
    id: row.id,
    weekId: row.week_id,
    dayNumber: row.day_number,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    imageUrl: row.image_url,
    summaryImageUrl: row.summary_image_url,
    category: row.category,
    order: row.display_order,
    status: row.status,
    isOptional: !!row.is_optional,
    exercises: [],
  }
}

function mapWeek(row) {
  return {
    id: row.id,
    programId: row.program_id,
    number: row.number,
    title: row.title || null,
    isLocked: !!row.is_locked, // template global (admin)
    days: [],
  }
}

function mapProgram(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    type: row.type,
    isActive: !!row.is_active,
    isLocked: !!row.is_locked, // template global
    unlockAfterProgramId: row.unlock_after_program_id,
    order: row.display_order,
    weeks: [],
  }
}

// Un programme est "terminé" par un utilisateur si chacun de ses jours a au
// moins une séance complétée par cet utilisateur.
async function isProgramCompletedByUser(userId, programId) {
  const [[row]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM workout_days wd JOIN weeks w ON w.id = wd.week_id WHERE w.program_id = ?) AS total_days,
       (SELECT COUNT(DISTINCT ws.day_id) FROM workout_sessions ws
          JOIN workout_days wd ON wd.id = ws.day_id JOIN weeks w ON w.id = wd.week_id
        WHERE w.program_id = ? AND ws.user_id = ? AND ws.status = 'completed') AS done_days`,
    [programId, programId, userId],
  )
  return row.total_days > 0 && row.done_days >= row.total_days
}

/** Une semaine est terminée pour un client si toutes ses journées (non optionnelles) ont une session completed. */
export async function isWeekCompletedByUser(userId, weekId) {
  const [[row]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM workout_days WHERE week_id = ? AND is_optional = 0) AS total_days,
       (SELECT COUNT(DISTINCT ws.day_id) FROM workout_sessions ws
          JOIN workout_days wd ON wd.id = ws.day_id
        WHERE wd.week_id = ? AND wd.is_optional = 0 AND ws.user_id = ? AND ws.status = 'completed') AS done_days`,
    [weekId, weekId, userId],
  )
  return row.total_days > 0 && row.done_days >= row.total_days
}

/** Détermine si un client a accès à une semaine (accès individuel prioritaire, sinon template global + n°1). */
async function resolveWeekAccessForUser(userId, week) {
  // Accès individuel explicite
  const [[access]] = await pool.query(
    'SELECT is_unlocked FROM user_week_access WHERE user_id = ? AND week_id = ?',
    [userId, week.id],
  )
  if (access) return !!access.is_unlocked

  // Pas d'entrée individuelle :
  // - Si le template global est verrouillé → bloqué
  // - Sinon (is_locked = 0) → accessible
  // - Semaine 1 est accessible par défaut si aucune entrée
  if (week.number === 1) return true
  return !week.isLocked
}

/** Détermine si un client a accès à un programme (défi). */
async function resolveProgramAccessForUser(userId, program) {
  // Accès individuel explicite (prioritaire sur tout le reste)
  const [[access]] = await pool.query(
    'SELECT is_unlocked FROM user_program_access WHERE user_id = ? AND program_id = ?',
    [userId, program.id],
  )
  if (access) {
    return Number(access.is_unlocked) === 1
  }

  // Verrouillage manuel global admin
  if (program.isLocked) return false

  // Chaîne unlock_after_program_id
  if (program.unlockAfterProgramId) {
    return await isProgramCompletedByUser(userId, program.unlockAfterProgramId)
  }

  return true
}

// GET /programs — arbre complet, avec déblocage calculé pour l'utilisateur courant si connecté
export const listPrograms = asyncHandler(async (req, res) => {
  const [programs] = await pool.query('SELECT * FROM programs WHERE is_active = 1 ORDER BY display_order, created_at')
  const [weeks] = await pool.query('SELECT * FROM weeks ORDER BY number')
  const [days] = await pool.query('SELECT * FROM workout_days ORDER BY display_order')
  const [exercises] = await pool.query('SELECT * FROM exercises ORDER BY display_order')

  const dayMap = new Map(days.map((d) => [d.id, mapDay(d)]))
  for (const exo of exercises) dayMap.get(exo.day_id)?.exercises.push(mapExercise(exo))

  const weekMap = new Map(weeks.map((w) => [w.id, mapWeek(w)]))
  for (const day of days) weekMap.get(day.week_id)?.days.push(dayMap.get(day.id))

  const programMap = new Map(programs.map((p) => [p.id, mapProgram(p)]))
  for (const week of weeks) programMap.get(week.program_id)?.weeks.push(weekMap.get(week.id))

  // Calcul d'accès :
  // - Admin : on conserve les flags globaux (template) pour l'interface de gestion
  // - Client authentifié : isLocked = !accès individuel (progression + user_*_access)
  // - Non authentifié : template + unlock_after
  if (req.user && req.user.role === 'client') {
    for (const program of programMap.values()) {
      const hasProgramAccess = await resolveProgramAccessForUser(req.user.id, program)
      program.isLocked = !hasProgramAccess

      for (const week of program.weeks) {
        const hasWeekAccess = await resolveWeekAccessForUser(req.user.id, week)
        week.isLocked = !hasWeekAccess
      }
    }
  } else if (!req.user) {
    for (const program of programMap.values()) {
      if (program.unlockAfterProgramId) {
        program.isLocked = true
      }
    }
  }
  // admin : laisse isLocked = template global

  res.json([...programMap.values()])
})

export const createProgram = asyncHandler(async (req, res) => {
  const { title, description, imageUrl, type, unlockAfterProgramId, isLocked, order } = req.body
  if (!title) throw new ApiError(400, 'Le titre est requis')
  const id = uuid()
  await pool.query(
    `INSERT INTO programs (id, title, description, image_url, type, unlock_after_program_id, is_locked, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      title,
      description || null,
      imageUrl || null,
      type === 'challenge' ? 'challenge' : 'weekly',
      unlockAfterProgramId || null,
      isLocked ? 1 : 0,
      order ?? 0,
    ],
  )
  res.status(201).json({ id })
})

export const updateProgram = asyncHandler(async (req, res) => {
  const { title, description, imageUrl, isActive, isLocked, unlockAfterProgramId } = req.body
  const fields = []
  const values = []
  if (title !== undefined) { fields.push('title = ?'); values.push(title) }
  if (description !== undefined) { fields.push('description = ?'); values.push(description) }
  if (imageUrl !== undefined) { fields.push('image_url = ?'); values.push(imageUrl) }
  if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0) }
  if (isLocked !== undefined) { fields.push('is_locked = ?'); values.push(isLocked ? 1 : 0) }
  if (unlockAfterProgramId !== undefined) { fields.push('unlock_after_program_id = ?'); values.push(unlockAfterProgramId || null) }
  if (!fields.length) throw new ApiError(400, 'Aucune modification fournie')
  values.push(req.params.id)
  const [result] = await pool.query(`UPDATE programs SET ${fields.join(', ')} WHERE id = ?`, values)
  if (!result.affectedRows) throw new ApiError(404, 'Programme introuvable')
  res.status(204).send()
})

export const toggleProgramLock = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT is_locked FROM programs WHERE id = ?', [req.params.id])
  if (!rows[0]) throw new ApiError(404, 'Programme introuvable')
  const newValue = rows[0].is_locked ? 0 : 1
  await pool.query('UPDATE programs SET is_locked = ? WHERE id = ?', [newValue, req.params.id])
  res.json({ id: req.params.id, isLocked: !!newValue })
})

export const deleteProgram = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM programs WHERE id = ?', [req.params.id])
  if (!result.affectedRows) throw new ApiError(404, 'Programme introuvable')
  res.status(204).send()
})

// --- Semaines -----------------------------------------------------------

/**
 * Création d'une semaine + 4 journées par défaut.
 * Body: { number?, title?, isLocked? }
 */
export const createWeek = asyncHandler(async (req, res) => {
  const { programId } = req.params
  const { number, title, isLocked = true } = req.body

  // Vérifier que le programme existe
  const [[prog]] = await pool.query('SELECT id FROM programs WHERE id = ?', [programId])
  if (!prog) throw new ApiError(404, 'Programme introuvable')

  // Numéro auto si non fourni
  let weekNumber = number
  if (weekNumber == null) {
    const [[maxRow]] = await pool.query(
      'SELECT COALESCE(MAX(number), 0) AS max_num FROM weeks WHERE program_id = ?',
      [programId],
    )
    weekNumber = maxRow.max_num + 1
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const weekId = uuid()
    await conn.query(
      'INSERT INTO weeks (id, program_id, number, title, is_locked) VALUES (?, ?, ?, ?, ?)',
      [weekId, programId, weekNumber, title || null, isLocked ? 1 : 0],
    )

    // 4 journées par défaut
    const dayIds = []
    for (let i = 1; i <= 4; i++) {
      const dayId = uuid()
      dayIds.push(dayId)
      await conn.query(
        `INSERT INTO workout_days (id, week_id, day_number, title, display_order, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [dayId, weekId, i, `Journée ${i}`, i],
      )
    }

    await conn.commit()
    res.status(201).json({
      id: weekId,
      number: weekNumber,
      title: title || null,
      dayIds,
    })
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, `La semaine numéro ${weekNumber} existe déjà pour ce programme`)
    }
    throw err
  } finally {
    conn.release()
  }
})

/** Mise à jour d'une semaine (titre, number, is_locked template) */
export const updateWeek = asyncHandler(async (req, res) => {
  const { title, number, isLocked } = req.body
  const fields = []
  const values = []
  if (title !== undefined) { fields.push('title = ?'); values.push(title || null) }
  if (number !== undefined) { fields.push('number = ?'); values.push(number) }
  if (isLocked !== undefined) { fields.push('is_locked = ?'); values.push(isLocked ? 1 : 0) }
  if (!fields.length) throw new ApiError(400, 'Aucune modification fournie')
  values.push(req.params.id)
  const [result] = await pool.query(`UPDATE weeks SET ${fields.join(', ')} WHERE id = ?`, values)
  if (!result.affectedRows) throw new ApiError(404, 'Semaine introuvable')
  res.status(204).send()
})

/** Toggle du verrouillage GLOBAL (template) — conservé pour compatibilité */
export const toggleWeekLock = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT is_locked FROM weeks WHERE id = ?', [req.params.id])
  if (!rows[0]) throw new ApiError(404, 'Semaine introuvable')
  const newValue = rows[0].is_locked ? 0 : 1
  await pool.query('UPDATE weeks SET is_locked = ? WHERE id = ?', [newValue, req.params.id])
  res.json({ id: req.params.id, isLocked: !!newValue })
})

/**
 * Déverrouiller / verrouiller une semaine pour un ou plusieurs clients.
 * Body: { userIds: string[], isUnlocked: boolean }
 */
export const setWeekAccess = asyncHandler(async (req, res) => {
  const weekId = req.params.id
  const { userIds, isUnlocked } = req.body
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ApiError(400, 'userIds (tableau) est requis')
  }
  if (typeof isUnlocked !== 'boolean') {
    throw new ApiError(400, 'isUnlocked (boolean) est requis')
  }

  const [[week]] = await pool.query('SELECT id FROM weeks WHERE id = ?', [weekId])
  if (!week) throw new ApiError(404, 'Semaine introuvable')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    for (const userId of userIds) {
      await conn.query(
        `INSERT INTO user_week_access (id, user_id, week_id, is_unlocked, unlocked_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_unlocked = VALUES(is_unlocked),
                                 unlocked_at = IF(VALUES(is_unlocked)=1, COALESCE(unlocked_at, NOW()), unlocked_at),
                                 updated_at = NOW()`,
        [uuid(), userId, weekId, isUnlocked ? 1 : 0, isUnlocked ? new Date() : null],
      )
    }
    await conn.commit()
    res.json({ weekId, userIds, isUnlocked })
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
})

/**
 * Déverrouiller / verrouiller un PROGRAMME pour un ou plusieurs clients.
 * Body: { userIds: string[], isUnlocked: boolean }
 */
export const setProgramAccess = asyncHandler(async (req, res) => {
  const programId = req.params.id
  const { userIds, isUnlocked } = req.body
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ApiError(400, 'userIds (tableau) est requis')
  }
  if (typeof isUnlocked !== 'boolean') {
    throw new ApiError(400, 'isUnlocked (boolean) est requis')
  }

  const [[prog]] = await pool.query('SELECT id FROM programs WHERE id = ?', [programId])
  if (!prog) throw new ApiError(404, 'Programme introuvable')

  // Semaine 1 du programme (pour débloquer l'entrée du défi côté client)
  const [week1rows] = await pool.query(
    'SELECT id FROM weeks WHERE program_id = ? AND number = 1',
    [programId],
  )

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    for (const userId of userIds) {
      await conn.query(
        `INSERT INTO user_program_access (id, user_id, program_id, is_unlocked, unlocked_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE is_unlocked = VALUES(is_unlocked),
                                 unlocked_at = IF(VALUES(is_unlocked)=1, COALESCE(unlocked_at, NOW()), unlocked_at),
                                 updated_at = NOW()`,
        [uuid(), userId, programId, isUnlocked ? 1 : 0, isUnlocked ? new Date() : null],
      )
      // Débloquer (ou re-verrouiller) la semaine 1 pour que le client puisse entrer dans le défi
      for (const w of week1rows) {
        await conn.query(
          `INSERT INTO user_week_access (id, user_id, week_id, is_unlocked, unlocked_at)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE is_unlocked = VALUES(is_unlocked),
                                   unlocked_at = IF(VALUES(is_unlocked)=1, COALESCE(unlocked_at, NOW()), unlocked_at),
                                   updated_at = NOW()`,
          [uuid(), userId, w.id, isUnlocked ? 1 : 0, isUnlocked ? new Date() : null],
        )
      }
    }
    await conn.commit()
    res.json({ programId, userIds, isUnlocked })
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
})

/**
 * Dupliquer une semaine (copie indépendante : nouveaux IDs pour semaine, jours, exercices).
 */
export const duplicateWeek = asyncHandler(async (req, res) => {
  const sourceWeekId = req.params.id

  const [[source]] = await pool.query('SELECT * FROM weeks WHERE id = ?', [sourceWeekId])
  if (!source) throw new ApiError(404, 'Semaine source introuvable')

  const [sourceDays] = await pool.query(
    'SELECT * FROM workout_days WHERE week_id = ? ORDER BY display_order, day_number',
    [sourceWeekId],
  )
  const dayIds = sourceDays.map((d) => d.id)
  let sourceExercises = []
  if (dayIds.length) {
    const [exos] = await pool.query(
      `SELECT * FROM exercises WHERE day_id IN (${dayIds.map(() => '?').join(',')}) ORDER BY display_order`,
      dayIds,
    )
    sourceExercises = exos
  }

  // Nouveau numéro
  const [[maxRow]] = await pool.query(
    'SELECT COALESCE(MAX(number), 0) AS max_num FROM weeks WHERE program_id = ?',
    [source.program_id],
  )
  const newNumber = maxRow.max_num + 1

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const newWeekId = uuid()
    const newTitle = source.title
      ? `${source.title} (copie)`
      : `Semaine ${newNumber}`

    await conn.query(
      'INSERT INTO weeks (id, program_id, number, title, is_locked) VALUES (?, ?, ?, ?, ?)',
      [newWeekId, source.program_id, newNumber, newTitle, source.is_locked],
    )

    const dayIdMap = new Map() // oldDayId → newDayId
    for (const day of sourceDays) {
      const newDayId = uuid()
      dayIdMap.set(day.id, newDayId)
      await conn.query(
        `INSERT INTO workout_days
           (id, week_id, day_number, title, subtitle, description, image_url, summary_image_url,
            category, display_order, status, is_optional)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newDayId,
          newWeekId,
          day.day_number,
          day.title,
          day.subtitle,
          day.description,
          day.image_url,
          day.summary_image_url,
          day.category,
          day.display_order,
          day.status,
          day.is_optional,
        ],
      )
    }

    for (const exo of sourceExercises) {
      const newDayId = dayIdMap.get(exo.day_id)
      if (!newDayId) continue
      await conn.query(
        `INSERT INTO exercises
           (id, day_id, name, description, image_url, sets, reps, duration, recommended_weight, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          newDayId,
          exo.name,
          exo.description,
          exo.image_url,
          exo.sets,
          exo.reps,
          exo.duration,
          exo.recommended_weight,
          exo.display_order,
        ],
      )
    }

    await conn.commit()
    res.status(201).json({ id: newWeekId, number: newNumber, title: newTitle })
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
})

export const deleteWeek = asyncHandler(async (req, res) => {
  const [result] = await pool.query('DELETE FROM weeks WHERE id = ?', [req.params.id])
  if (!result.affectedRows) throw new ApiError(404, 'Semaine introuvable')
  res.status(204).send()
})

/**
 * Logique de progression automatique appelée après completion d'une séance.
 * - Marque la semaine comme terminée si toutes les journées sont faites
 * - Débloque la semaine suivante (ou la crée avec jours mélangés si ≤ 4)
 * - Ne crée jamais de Semaine 5 automatique
 * - Refaire une ancienne semaine ne déclenche pas de nouveau déblocage
 */
export async function handleWeekProgression(userId, completedDayId) {
  // Récupérer la semaine de la journée terminée
  const [[day]] = await pool.query(
    `SELECT wd.week_id, w.program_id, w.number
     FROM workout_days wd
     JOIN weeks w ON w.id = wd.week_id
     WHERE wd.id = ?`,
    [completedDayId],
  )
  if (!day) return

  const weekId = day.week_id
  const programId = day.program_id
  const currentNumber = day.number

  // Vérifier si la semaine est maintenant complète pour ce client
  const completed = await isWeekCompletedByUser(userId, weekId)
  if (!completed) return

  // Vérifier si cette semaine a déjà été marquée terminée (refaire une ancienne semaine ne doit rien débloquer)
  const [[prior]] = await pool.query(
    'SELECT completed_at FROM user_week_access WHERE user_id = ? AND week_id = ?',
    [userId, weekId],
  )
  const alreadyCompleted = prior && prior.completed_at

  // Marquer completed_at (première fois seulement grâce à COALESCE)
  await pool.query(
    `INSERT INTO user_week_access (id, user_id, week_id, is_unlocked, unlocked_at, completed_at)
     VALUES (?, ?, ?, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       completed_at = COALESCE(completed_at, NOW()),
       is_unlocked = 1,
       updated_at = NOW()`,
    [uuid(), userId, weekId],
  )

  if (alreadyCompleted) return // refaire une ancienne semaine → aucun nouveau déblocage
  if (currentNumber >= 4) return // Max 4 semaines automatiques

  const nextNumber = currentNumber + 1

  // Chercher si la semaine suivante existe déjà
  const [[nextWeek]] = await pool.query(
    'SELECT id FROM weeks WHERE program_id = ? AND number = ?',
    [programId, nextNumber],
  )

  if (nextWeek) {
    // Débloquer pour ce client uniquement
    await pool.query(
      `INSERT INTO user_week_access (id, user_id, week_id, is_unlocked, unlocked_at)
       VALUES (?, ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE is_unlocked = 1,
                               unlocked_at = COALESCE(unlocked_at, NOW()),
                               updated_at = NOW()`,
      [uuid(), userId, nextWeek.id],
    )
    return
  }

  // Créer la semaine suivante avec jours mélangés à partir de la semaine courante
  const [sourceDays] = await pool.query(
    'SELECT * FROM workout_days WHERE week_id = ? ORDER BY display_order, day_number',
    [weekId],
  )
  if (!sourceDays.length) return

  // Mélanger (Fisher-Yates)
  const shuffled = [...sourceDays]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const dayIds = sourceDays.map((d) => d.id)
  let sourceExercises = []
  if (dayIds.length) {
    const [exos] = await pool.query(
      `SELECT * FROM exercises WHERE day_id IN (${dayIds.map(() => '?').join(',')})`,
      dayIds,
    )
    sourceExercises = exos
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const newWeekId = uuid()
    await conn.query(
      'INSERT INTO weeks (id, program_id, number, title, is_locked) VALUES (?, ?, ?, ?, 1)',
      [newWeekId, programId, nextNumber, `Semaine ${nextNumber}`],
    )

    // Débloquer immédiatement pour ce client
    await conn.query(
      `INSERT INTO user_week_access (id, user_id, week_id, is_unlocked, unlocked_at)
       VALUES (?, ?, ?, 1, NOW())`,
      [uuid(), userId, newWeekId],
    )

    const dayIdMap = new Map()
    for (let i = 0; i < shuffled.length; i++) {
      const src = shuffled[i]
      const newDayId = uuid()
      dayIdMap.set(src.id, newDayId)
      await conn.query(
        `INSERT INTO workout_days
           (id, week_id, day_number, title, subtitle, description, image_url, summary_image_url,
            category, display_order, status, is_optional)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newDayId,
          newWeekId,
          i + 1,
          src.title,
          src.subtitle,
          src.description,
          src.image_url,
          src.summary_image_url,
          src.category,
          i + 1,
          src.status,
          src.is_optional,
        ],
      )
    }

    for (const exo of sourceExercises) {
      const newDayId = dayIdMap.get(exo.day_id)
      if (!newDayId) continue
      await conn.query(
        `INSERT INTO exercises
           (id, day_id, name, description, image_url, sets, reps, duration, recommended_weight, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          newDayId,
          exo.name,
          exo.description,
          exo.image_url,
          exo.sets,
          exo.reps,
          exo.duration,
          exo.recommended_weight,
          exo.display_order,
        ],
      )
    }

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    console.error('handleWeekProgression error:', err.message)
  } finally {
    conn.release()
  }
}