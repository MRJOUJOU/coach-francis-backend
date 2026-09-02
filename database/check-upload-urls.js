import { pool } from '../src/config/db.js'

async function checkUploadUrls() {
  try {
    const checks = [
      ['users', 'avatar_url'],
      ['workout_days', 'image_url'],
      ['workout_days', 'summary_image_url'],
      ['exercises', 'image_url'],
    ]

    for (const [table, column] of checks) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM \`${table}\`
         WHERE \`${column}\` LIKE '/uploads/%'`
      )

      console.log(`${table}.${column} → ${rows[0].total}`)
    }
  } catch (error) {
    console.error('Erreur :', error.message)
  } finally {
    await pool.end()
  }
}

checkUploadUrls()