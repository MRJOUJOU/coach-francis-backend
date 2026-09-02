import cloudinary from '../config/cloudinary.js'
import { Readable } from 'node:stream'

export function uploadBufferToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `coach-francis/${folder}`,
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

    Readable.from(buffer).pipe(uploadStream)
  })
}