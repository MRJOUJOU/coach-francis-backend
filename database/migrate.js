import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    ssl: {
      rejectUnauthorized: false,
    },

    multipleStatements: true,
  })

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'schema.sql'),
      'utf8'
    )

    console.log('→ Connexion à MySQL...')
    console.log('→ Application du schéma...')

    await connection.query(sql)

    console.log('✓ Schéma appliqué avec succès sur Aiven.')
  } finally {
    await connection.end()
  }
}

migrate().catch((err) => {
  console.error('✗ Échec de la migration :', err.message)
  process.exit(1)
})