import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { v4 as uuid } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsRoot = path.join(__dirname, '..', '..', 'uploads')

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const MAX_SIZE = 5 * 1024 * 1024 // 5 Mo

/**
 * Stockage local
 * Utilisé uniquement en développement.
 */
function localStorageFor(category) {
  const dir = path.join(uploadsRoot, category)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, dir)
    },

    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      cb(null, `${uuid()}${ext}`)
    },
  })
}

/**
 * En production, on garde le fichier en mémoire.
 * Il sera ensuite envoyé à Cloudinary.
 */
const memoryStorage = multer.memoryStorage()

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(
      new Error(
        'Type de fichier non autorisé — seules les images sont acceptées'
      )
    )
  }

  cb(null, true)
}

export function uploadFor(category) {
  const storage =
    process.env.NODE_ENV === 'production'
      ? memoryStorage
      : localStorageFor(category)

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: MAX_SIZE,
    },
  })
}

/**
 * URL utilisée en développement.
 */
export function publicUrlFor(category, filename) {
  return `/uploads/${category}/${filename}`
}