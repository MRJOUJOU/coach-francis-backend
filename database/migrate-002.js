/**
 * Migration 002 — champs activité planifiée (type + image)
 * Idempotente, sans perte de données.
 */
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  return rows[0].c > 0
}

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  })

  console.log('→ Migration 002 : planned_sessions activity_type + image_url')

  if (!(await columnExists(conn, 'planned_sessions', 'activity_type'))) {
    await conn.query(`
      ALTER TABLE planned_sessions
      ADD COLUMN activity_type VARCHAR(50) NULL AFTER title
    `)
    console.log('  ✓ activity_type ajouté')
  } else {
    console.log('  · activity_type déjà présent')
  }

  if (!(await columnExists(conn, 'planned_sessions', 'image_url'))) {
    await conn.query(`
      ALTER TABLE planned_sessions
      ADD COLUMN image_url VARCHAR(500) NULL AFTER notes
    `)
    console.log('  ✓ image_url ajouté')
  } else {
    console.log('  · image_url déjà présent')
  }

  await conn.end()
  console.log('✓ Migration 002 terminée.')
}

migrate().catch((err) => {
  console.error('✗ Échec migration 002 :', err.message)
  process.exit(1)
})
