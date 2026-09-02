import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import cloudinary from '../src/config/cloudinary.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsRoot = path.join(__dirname, '..', 'uploads')

const categories = ['avatars', 'days', 'exercises']

async function migrateImages() {
  let connection

  try {
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
    })

    console.log('✓ Connexion Aiven établie\n')

    for (const category of categories) {
      const folder = path.join(uploadsRoot, category)

      if (!fs.existsSync(folder)) {
        console.log(`⚠ Dossier absent : ${category}`)
        continue
      }

      const files = fs
        .readdirSync(folder)
        .filter((file) => !file.startsWith('.'))

      for (const filename of files) {
        const filePath = path.join(folder, filename)

        if (!fs.statSync(filePath).isFile()) {
          continue
        }

        console.log(`→ Migration : ${category}/${filename}`)

        const oldUrl = `/uploads/${category}/${filename}`

        const [rows] = await connection.query(
          `
          SELECT 'users' AS table_name, id
          FROM users
          WHERE avatar_url = ?

          UNION ALL

          SELECT 'workout_days' AS table_name, id
          FROM workout_days
          WHERE image_url = ? OR summary_image_url = ?

          UNION ALL

          SELECT 'exercises' AS table_name, id
          FROM exercises
          WHERE image_url = ?
          `,
          [oldUrl, oldUrl, oldUrl, oldUrl]
        )

        if (rows.length === 0) {
          console.log(`  ⚠ Aucune référence trouvée dans la base`)
          continue
        }

        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload(
            filePath,
            {
              folder: `coach-francis/${category}`,
              resource_type: 'image',
            },
            (error, result) => {
              if (error) {
                reject(error)
                return
              }

              resolve(result)
            }
          )
        })

        const cloudinaryUrl = result.secure_url

        console.log(`  ✓ Cloudinary : ${cloudinaryUrl}`)

        for (const row of rows) {
          if (row.table_name === 'users') {
            await connection.query(
              'UPDATE users SET avatar_url = ? WHERE id = ?',
              [cloudinaryUrl, row.id]
            )

            console.log(`  ✓ users/${row.id} mis à jour`)
          }

          if (row.table_name === 'workout_days') {
            const [dayRows] = await connection.query(
              `
              SELECT image_url, summary_image_url
              FROM workout_days
              WHERE id = ?
              `,
              [row.id]
            )

            const day = dayRows[0]

            if (day.image_url === oldUrl) {
              await connection.query(
                'UPDATE workout_days SET image_url = ? WHERE id = ?',
                [cloudinaryUrl, row.id]
              )

              console.log(`  ✓ workout_days/${row.id} image_url mis à jour`)
            }

            if (day.summary_image_url === oldUrl) {
              await connection.query(
                'UPDATE workout_days SET summary_image_url = ? WHERE id = ?',
                [cloudinaryUrl, row.id]
              )

              console.log(
                `  ✓ workout_days/${row.id} summary_image_url mis à jour`
              )
            }
          }

          if (row.table_name === 'exercises') {
            await connection.query(
              'UPDATE exercises SET image_url = ? WHERE id = ?',
              [cloudinaryUrl, row.id]
            )

            console.log(`  ✓ exercises/${row.id} mis à jour`)
          }
        }

        console.log('')
      }
    }

    console.log('========================================')
    console.log('✓ MIGRATION DES IMAGES TERMINÉE')
    console.log('========================================')
  } catch (error) {
    console.error('\n✗ Échec de la migration :')
    console.error(error.message)
    process.exitCode = 1
  } finally {
    if (connection) {
      await connection.end()
    }
  }
}

migrateImages()