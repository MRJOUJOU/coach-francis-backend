import cron from 'node-cron'
import { pool } from '../config/db.js'
import { notifyUser } from '../utils/notify.js'

/**
 * Notifie les clients qui ont une séance planifiée aujourd'hui (notified=0).
 * Évite les doublons grâce au flag notified.
 */
async function checkPlannedSessionsToday() {
  const [rows] = await pool.query(
    `SELECT * FROM planned_sessions
     WHERE scheduled_date = CURDATE() AND status = 'planned' AND notified = 0`,
  )

  for (const session of rows) {
    const timeText = session.scheduled_time ? ` à ${String(session.scheduled_time).slice(0, 5)}` : ''
    await notifyUser(session.user_id, {
      type: 'reminder',
      title: "Séance prévue aujourd'hui",
      body: `${session.title}${timeText} — Vous aviez prévu cette séance aujourd'hui.`,
      link: `/client/planification?highlight=${session.id}`,
    })
    await pool.query('UPDATE planned_sessions SET notified = 1 WHERE id = ?', [session.id])
  }

  if (rows.length) console.log(`[cron] ${rows.length} rappel(s) de séance planifiée envoyé(s)`)
}

/**
 * Passe en "missed" les séances planned dont la date est passée.
 */
async function markMissedSessions() {
  const [result] = await pool.query(
    `UPDATE planned_sessions
     SET status = 'missed'
     WHERE status = 'planned' AND scheduled_date < CURDATE()`,
  )
  if (result.affectedRows) {
    console.log(`[cron] ${result.affectedRows} séance(s) marquée(s) manquée(s)`)
  }
}

export function startPlannedSessionJob() {
  // Tous les jours à 7h00
  cron.schedule('0 7 * * *', async () => {
    await checkPlannedSessionsToday()
    await markMissedSessions()
  })
  // Au démarrage
  checkPlannedSessionsToday().catch((err) => console.error('[cron] erreur planification :', err.message))
  markMissedSessions().catch((err) => console.error('[cron] erreur missed :', err.message))
}