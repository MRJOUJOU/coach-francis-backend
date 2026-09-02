import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let connection

async function importData() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'data.sql'),
      'utf8'
    )

    console.log('→ Connexion à Aiven...')

    connection = await mysql.createConnection({
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

    console.log('✓ Connexion Aiven établie')
    console.log('→ Désactivation temporaire des contraintes FK...')

    await connection.query('SET FOREIGN_KEY_CHECKS = 0')

    console.log('→ Import des données...')

    await connection.query(sql)

    await connection.query('SET FOREIGN_KEY_CHECKS = 1')

    console.log('✓ Données importées avec succès dans Aiven !')
  } catch (error) {
    console.error('✗ Échec de l’import :')
    console.error(error.message)

    if (connection) {
      try {
        await connection.query('SET FOREIGN_KEY_CHECKS = 1')
      } catch {}
    }

    process.exitCode = 1
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

importData()