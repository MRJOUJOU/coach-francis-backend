import cron from 'node-cron'
import { pool } from '../config/db.js'
import { notifyUser, notifyAdmins } from '../utils/notify.js'

// Tous les jours à 8h00 : notifie chaque client dont l'abonnement expire
// dans exactement 7 jours, sans doublon si le job tourne plusieurs fois.
async function checkExpiringSubscriptions() {
  const [clients] = await pool.query(
    `SELECT id, first_name, last_name, subscription_end FROM users
     WHERE role = 'client' AND status = 'active' AND subscription_end IS NOT NULL
       AND subscription_end BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)`,
  )

  for (const client of clients) {
    const [existing] = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = 'subscription' AND created_at > DATE_SUB(NOW(), INTERVAL 20 HOUR)`,
      [client.id],
    )
    if (existing.length) continue // déjà notifié récemment, on évite le doublon

    await notifyUser(client.id, {
      type: 'subscription',
      title: 'Abonnement bientôt terminé',
      body: "Ton abonnement se termine bientôt — contacte ton coach Francis pour le renouveler.",
      link: '/client/profil',
    })

    await notifyAdmins({
      type: 'subscription',
      title: 'Abonnement client à renouveler',
      body: `${client.first_name} ${client.last_name} arrive bientôt en fin d'abonnement`,
      link: '/admin/clients',
    })
  }

  if (clients.length) {
    console.log(`[cron] ${clients.length} rappel(s) d'abonnement envoyé(s)`)
  }
}

export function startScheduledJobs() {
  // '0 8 * * *' = tous les jours à 8h00 (heure du serveur)
  cron.schedule('0 8 * * *', checkExpiringSubscriptions)
  // Exécution immédiate au démarrage pour ne pas attendre le lendemain matin
  checkExpiringSubscriptions().catch((err) => console.error('[cron] erreur initiale :', err.message))
}
