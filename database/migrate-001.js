/**
 * Migration 001 — Accès par client + titre de semaine
 * Safe / idempotent. Ne détruit aucune donnée existante.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  )
  return rows[0].c > 0
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  )
  return rows[0].c > 0
}

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  })

  console.log('→ Migration 001 : accès par client + titre de semaine')

  // 1. title on weeks
  if (!(await columnExists(conn, 'weeks', 'title'))) {
    await conn.query(`ALTER TABLE weeks ADD COLUMN title VARCHAR(150) NULL AFTER number`)
    console.log('  ✓ Colonne weeks.title ajoutée')
  } else {
    console.log('  · Colonne weeks.title déjà présente')
  }

  // 2. user_week_access
  if (!(await tableExists(conn, 'user_week_access'))) {
    await conn.query(`
      CREATE TABLE user_week_access (
        id            CHAR(36)      NOT NULL PRIMARY KEY,
        user_id       CHAR(36)      NOT NULL,
        week_id       CHAR(36)      NOT NULL,
        is_unlocked   TINYINT(1)    NOT NULL DEFAULT 0,
        unlocked_at   DATETIME      NULL,
        completed_at  DATETIME      NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_week (user_id, week_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (week_id) REFERENCES weeks(id) ON DELETE CASCADE,
        INDEX idx_uwa_user (user_id),
        INDEX idx_uwa_week (week_id)
      ) ENGINE=InnoDB
    `)
    console.log('  ✓ Table user_week_access créée')
  } else {
    console.log('  · Table user_week_access déjà présente')
  }

  // 3. user_program_access
  if (!(await tableExists(conn, 'user_program_access'))) {
    await conn.query(`
      CREATE TABLE user_program_access (
        id            CHAR(36)      NOT NULL PRIMARY KEY,
        user_id       CHAR(36)      NOT NULL,
        program_id    CHAR(36)      NOT NULL,
        is_unlocked   TINYINT(1)    NOT NULL DEFAULT 0,
        unlocked_at   DATETIME      NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_program (user_id, program_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
        INDEX idx_upa_user (user_id),
        INDEX idx_upa_program (program_id)
      ) ENGINE=InnoDB
    `)
    console.log('  ✓ Table user_program_access créée')
  } else {
    console.log('  · Table user_program_access déjà présente')
  }

  // 4. Seed : débloquer semaine 1 pour tous les clients existants
  const [result] = await conn.query(`
    INSERT IGNORE INTO user_week_access (id, user_id, week_id, is_unlocked, unlocked_at)
    SELECT
      UUID(),
      u.id,
      w.id,
      1,
      NOW()
    FROM users u
    CROSS JOIN weeks w
    WHERE u.role = 'client'
      AND w.number = 1
      AND NOT EXISTS (
        SELECT 1 FROM user_week_access uwa
        WHERE uwa.user_id = u.id AND uwa.week_id = w.id
      )
  `)
  console.log(`  ✓ Semaine 1 débloquée pour les clients existants (${result.affectedRows} lignes)`)

  await conn.end()
  console.log('✓ Migration 001 terminée avec succès.')
}

migrate().catch((err) => {
  console.error('✗ Échec migration 001 :', err.message)
  process.exit(1)
})
