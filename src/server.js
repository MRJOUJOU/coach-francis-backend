import 'dotenv/config'
import http from 'node:http'
import { createApp } from './app.js'
import { initSockets } from './sockets/index.js'
import { testConnection } from './config/db.js'
import { startScheduledJobs } from './jobs/subscriptionReminders.js'
import { startPlannedSessionJob } from './jobs/plannedSessionReminders.js'

const PORT = process.env.PORT || 4000

async function main() {
  try {
    await testConnection()
    console.log('✓ Connexion MySQL établie')
  } catch (err) {
    console.error('✗ Impossible de se connecter à MySQL :', err.message)
    process.exit(1)
  }

  const app = createApp()
  const httpServer = http.createServer(app)

  const io = initSockets(httpServer, process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  app.set('io', io)

  httpServer.listen(PORT, () => {
    console.log(`✓ API démarrée sur http://localhost:${PORT}`)
  })

  startScheduledJobs()
  startPlannedSessionJob()
}

main()
