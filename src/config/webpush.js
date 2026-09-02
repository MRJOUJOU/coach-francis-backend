import webpush from 'web-push'
import dotenv from 'dotenv'

dotenv.config()

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env

export const pushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)

if (pushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:contact@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

export { webpush }
