import 'dotenv/config'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'

const img = (id) => `https://images.unsplash.com/${id}?w=600&auto=format&fit=crop`

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  })

  console.log('→ Nettoyage des données existantes...')
  await conn.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of [
    'activity_logs', 'notifications', 'messages', 'conversations', 'notes',
    'exercise_logs', 'client_comments', 'invitations', 'planned_sessions',
    'exercise_reports', 'body_measurements', 'exercise_performances', 'workout_sessions',
    'exercises', 'workout_days', 'weeks', 'programs', 'refresh_tokens',
    'tips', 'site_contents', 'users',
  ]) {
    await conn.query(`DELETE FROM ${table}`)
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1')

  console.log('→ Création des comptes de démonstration...')
  const adminId = uuid()
  const client1Id = uuid()
  const client2Id = uuid()

  const adminPass = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'admin2026', 10)
  const clientPass = await bcrypt.hash(process.env.SEED_CLIENT_PASSWORD || 'client2026', 10)

  await conn.query(
    `INSERT INTO users (id, first_name, last_name, email, password_hash, role, status, avatar_color, subscription_end, has_onboarded)
     VALUES
     (?, 'Francis', 'Courbron', ?, ?, 'admin', 'active', '#ff4423', NULL, 1),
     (?, 'Émilie', 'Tremblay', ?, ?, 'client', 'active', '#3d7fff', DATE_ADD(NOW(), INTERVAL 7 DAY), 1),
     (?, 'Marc-Antoine', 'Gagnon', 'marc.gagnon@example.com', ?, 'client', 'active', '#c6ff3d', DATE_ADD(NOW(), INTERVAL 45 DAY), 0)`,
    [
      adminId, process.env.SEED_ADMIN_EMAIL || 'francis@coach.bj', adminPass,
      client1Id, process.env.SEED_CLIENT_EMAIL || 'emilie.tremblay@example.com', clientPass,
      client2Id, clientPass,
    ],
  )

  console.log('→ Création des programmes...')

  async function createProgramTree({ title, description, imageUrl, type, weeks, isLocked = false, unlockAfterProgramId = null }) {
    const programId = uuid()
    await conn.query(
      'INSERT INTO programs (id, title, description, image_url, type, is_locked, unlock_after_program_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [programId, title, description, imageUrl, type, isLocked ? 1 : 0, unlockAfterProgramId],
    )
    for (const week of weeks) {
      const weekId = uuid()
      await conn.query('INSERT INTO weeks (id, program_id, number, is_locked) VALUES (?, ?, ?, ?)', [
        weekId, programId, week.number, week.isLocked ? 1 : 0,
      ])
      for (const day of week.days) {
        const dayId = uuid()
        await conn.query(
          `INSERT INTO workout_days (id, week_id, day_number, title, subtitle, description, image_url, category, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [dayId, weekId, day.dayNumber, day.title, day.subtitle, day.description, day.imageUrl, day.category, day.dayNumber],
        )
        let order = 1
        for (const exo of day.exercises) {
          await conn.query(
            `INSERT INTO exercises (id, day_id, name, description, image_url, sets, reps, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuid(), dayId, exo.name, `Exécute ${exo.name.toLowerCase()} en gardant le dos droit et le geste contrôlé.`, exo.img, exo.sets, exo.reps, order++],
          )
        }
      }
    }
    return programId
  }

  const day = (dayNumber, title, subtitle, imageUrl, category, exercises) => ({
    dayNumber, title, subtitle, imageUrl, category, exercises,
    description: `Séance ${title.toLowerCase()} — suis l'ordre des exercices et respecte les temps de repos.`,
  })

  await createProgramTree({
    title: 'Programme Hebdomadaire',
    description: '12 jours répartis sur 4 semaines, progressifs et variés.',
    imageUrl: img('photo-1571019613454-1cb2f99b2d8b'),
    type: 'weekly',
    weeks: [
      {
        number: 1, isLocked: false,
        days: [
          day(1, 'Dos & Biceps', 'Fondations', img('photo-1571019613454-1cb2f99b2d8b'), 'strength', [
            { name: 'Tractions', sets: 3, reps: '10', img: img('photo-1517836357463-d25dfeac3438') },
            { name: 'Rowing barre', sets: 3, reps: '12', img: img('photo-1534438327276-14e5300c3a48') },
            { name: 'Curl haltères', sets: 3, reps: '15', img: img('photo-1517838277536-f5f99be501cd') },
          ]),
          day(2, 'Pectoraux & Triceps', 'Poussée', img('photo-1574680178050-55c6a6a96e0a'), 'strength', [
            { name: 'Développé couché', sets: 3, reps: '10', img: img('photo-1571019614242-c5c5dee9f50b') },
            { name: 'Dips', sets: 3, reps: '12', img: img('photo-1517836357463-d25dfeac3438') },
            { name: 'Extensions triceps', sets: 3, reps: '15', img: img('photo-1534438327276-14e5300c3a48') },
          ]),
          day(3, 'Corps Complet', 'Global', img('photo-1574680096145-d05b474e2155'), 'strength', [
            { name: 'Squats', sets: 3, reps: '12', img: img('photo-1517838277536-f5f99be501cd') },
            { name: 'Pompes', sets: 3, reps: '15', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Planche', sets: 3, reps: '30 sec', img: img('photo-1517836357463-d25dfeac3438') },
          ]),
        ],
      },
      {
        number: 2, isLocked: true,
        days: [
          day(4, 'Cardio Intensif', 'Endurance', img('photo-1599901860904-17e6ed7083a0'), 'cardio', [
            { name: 'Course', sets: 1, reps: '20 min', img: img('photo-1599901860904-17e6ed7083a0') },
            { name: 'Corde à sauter', sets: 3, reps: '2 min', img: img('photo-1534438327276-14e5300c3a48') },
            { name: 'Burpees', sets: 3, reps: '10', img: img('photo-1571019614242-c5c5dee9f50b') },
          ]),
          day(5, 'Épaules & Abdos', 'Ceinture', img('photo-1574680178050-55c6a6a96e0a'), 'strength', [
            { name: 'Développé militaire', sets: 3, reps: '10', img: img('photo-1517838277536-f5f99be501cd') },
            { name: 'Élévations latérales', sets: 3, reps: '12', img: img('photo-1517836357463-d25dfeac3438') },
            { name: 'Crunchs', sets: 3, reps: '20', img: img('photo-1534438327276-14e5300c3a48') },
          ]),
          day(6, 'Jambes', 'Bas du corps', img('photo-1574680096145-d05b474e2155'), 'strength', [
            { name: 'Squats', sets: 4, reps: '10', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Fentes', sets: 3, reps: '12', img: img('photo-1517838277536-f5f99be501cd') },
            { name: 'Soulevé de terre', sets: 3, reps: '10', img: img('photo-1571019614242-c5c5dee9f50b') },
          ]),
        ],
      },
      {
        number: 3, isLocked: true,
        days: [
          day(7, 'HIIT', 'Haute intensité', img('photo-1599901860904-17e6ed7083a0'), 'cardio', [
            { name: 'Sprints', sets: 8, reps: '30 sec', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Mountain climbers', sets: 3, reps: '20', img: img('photo-1534438327276-14e5300c3a48') },
            { name: 'Sauts groupés', sets: 3, reps: '15', img: img('photo-1517836357463-d25dfeac3438') },
          ]),
          day(8, 'Haut du corps', 'Dos & pecs', img('photo-1574680178050-55c6a6a96e0a'), 'strength', [
            { name: 'Développé couché', sets: 3, reps: '10', img: img('photo-1571019614242-c5c5dee9f50b') },
            { name: 'Tirage vertical', sets: 3, reps: '12', img: img('photo-1517838277536-f5f99be501cd') },
            { name: 'Élévations latérales', sets: 3, reps: '15', img: img('photo-1517836357463-d25dfeac3438') },
          ]),
          day(9, 'Yoga', 'Mobilité', img('photo-1599901860904-17e6ed7083a0'), 'flexibility', [
            { name: 'Postures', sets: 1, reps: '30 min', img: img('photo-1534438327276-14e5300c3a48') },
            { name: 'Étirements', sets: 1, reps: '15 min', img: img('photo-1571019613454-1cb2f99b2d8b') },
          ]),
        ],
      },
      {
        number: 4, isLocked: true,
        days: [
          day(10, 'Full Body Force', 'Complet', img('photo-1574680096145-d05b474e2155'), 'strength', [
            { name: 'Squats', sets: 4, reps: '8', img: img('photo-1517838277536-f5f99be501cd') },
            { name: 'Développé couché', sets: 4, reps: '8', img: img('photo-1571019614242-c5c5dee9f50b') },
            { name: 'Soulevé de terre', sets: 3, reps: '6', img: img('photo-1534438327276-14e5300c3a48') },
          ]),
          day(11, 'Endurance', 'Cardio long', img('photo-1599901860904-17e6ed7083a0'), 'cardio', [
            { name: 'Course', sets: 1, reps: '40 min', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Vélo', sets: 1, reps: '30 min', img: img('photo-1517836357463-d25dfeac3438') },
          ]),
          day(12, 'Récupération', 'Active', img('photo-1599901860904-17e6ed7083a0'), 'flexibility', [
            { name: 'Marche', sets: 1, reps: '30 min', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Étirements', sets: 1, reps: '15 min', img: img('photo-1534438327276-14e5300c3a48') },
          ]),
        ],
      },
    ],
  })

  const defiCompletId = await createProgramTree({
    title: 'Défi Complet',
    description: 'Défi intensif en 4 journées distinctes, réservé aux membres connectés.',
    imageUrl: img('photo-1534438327276-14e5300c3a48'),
    type: 'challenge',
    weeks: [
      {
        number: 1, isLocked: false,
        days: [
          day(1, 'Force Fondation', 'Bas du corps & dos', img('photo-1517838277536-f5f99be501cd'), 'strength', [
            { name: 'Squat', sets: 3, reps: '10', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Développé couché', sets: 3, reps: '10', img: img('photo-1571019614242-c5c5dee9f50b') },
            { name: 'Rowing barre', sets: 3, reps: '10', img: img('photo-1534438327276-14e5300c3a48') },
            { name: 'Curl biceps', sets: 3, reps: '10', img: img('photo-1517836357463-d25dfeac3438') },
            { name: 'Soulevé de terre', sets: 3, reps: '8', img: img('photo-1574680096145-d05b474e2155') },
          ]),
          day(2, 'Puissance Haut du Corps', 'Poussée & tirage', img('photo-1571019614242-c5c5dee9f50b'), 'strength', [
            { name: 'Développé militaire', sets: 3, reps: '10', img: img('photo-1517838277536-f5f99be501cd') },
            { name: 'Tirage vertical', sets: 3, reps: '12', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Dips', sets: 3, reps: '12', img: img('photo-1517836357463-d25dfeac3438') },
            { name: 'Élévations latérales', sets: 3, reps: '15', img: img('photo-1534438327276-14e5300c3a48') },
          ]),
          day(3, 'Cardio Explosif', 'Endurance & intensité', img('photo-1599901860904-17e6ed7083a0'), 'cardio', [
            { name: 'Sprints', sets: 6, reps: '30 sec', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Burpees', sets: 4, reps: '15', img: img('photo-1571019614242-c5c5dee9f50b') },
            { name: 'Corde à sauter', sets: 4, reps: '2 min', img: img('photo-1534438327276-14e5300c3a48') },
            { name: 'Mountain climbers', sets: 3, reps: '20', img: img('photo-1517836357463-d25dfeac3438') },
          ]),
          day(4, 'Gainage & Mobilité', 'Récupération active', img('photo-1599901860904-17e6ed7083a0'), 'flexibility', [
            { name: 'Planche', sets: 4, reps: '45 sec', img: img('photo-1517836357463-d25dfeac3438') },
            { name: 'Crunch Abmat', sets: 4, reps: '20', img: img('photo-1517838277536-f5f99be501cd') },
            { name: 'Étirements complets', sets: 1, reps: '15 min', img: img('photo-1571019613454-1cb2f99b2d8b') },
          ]),
        ],
      },
    ],
  })

  await createProgramTree({
    title: 'Défi Extrême',
    description: "Le niveau suivant — débloqué une fois le Défi Complet terminé.",
    imageUrl: img('photo-1571019614242-c5c5dee9f50b'),
    type: 'challenge',
    unlockAfterProgramId: defiCompletId,
    weeks: [
      {
        number: 1, isLocked: false,
        days: [
          day(1, 'Full Body Intensive #1', 'Fondations', img('photo-1517838277536-f5f99be501cd'), 'strength', [
            { name: 'Squat', sets: 4, reps: '10', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Développé couché', sets: 4, reps: '10', img: img('photo-1571019614242-c5c5dee9f50b') },
            { name: 'Rowing barre', sets: 4, reps: '10', img: img('photo-1534438327276-14e5300c3a48') },
            { name: 'Gainage', sets: 4, reps: '60 sec', img: img('photo-1517836357463-d25dfeac3438') },
          ]),
          day(2, 'Full Body Intensive #2', 'Performance', img('photo-1571019614242-c5c5dee9f50b'), 'strength', [
            { name: 'Presse à cuisses', sets: 4, reps: '12', img: img('photo-1574680096145-d05b474e2155') },
            { name: 'Tirage vertical', sets: 4, reps: '12', img: img('photo-1517838277536-f5f99be501cd') },
            { name: 'Développé assis', sets: 4, reps: '12', img: img('photo-1571019613454-1cb2f99b2d8b') },
          ]),
          day(3, 'Full Body Intensive #3', 'Elite', img('photo-1534438327276-14e5300c3a48'), 'strength', [
            { name: 'Développé couché', sets: 5, reps: '8-12', img: img('photo-1571019614242-c5c5dee9f50b') },
            { name: 'Tractions poulie haute', sets: 5, reps: '8-20', img: img('photo-1517836357463-d25dfeac3438') },
            { name: 'Squat', sets: 5, reps: '8-12', img: img('photo-1571019613454-1cb2f99b2d8b') },
            { name: 'Crunch Abmat', sets: 5, reps: '20-50', img: img('photo-1517838277536-f5f99be501cd') },
          ]),
        ],
      },
    ],
  })

  console.log('→ Conseils et contenu du site...')
  const tips = [
    ['Échauffement', 'flame', "5 à 10 minutes avant chaque séance pour préparer articulations et muscles."],
    ['Hydratation', 'droplet', "2 à 3 litres d'eau par jour, plus en période d'entraînement intense."],
    ['Récupération', 'moon', "7 à 8 heures de sommeil pour permettre aux muscles de se reconstruire."],
    ['Nutrition', 'apple', "Des repas équilibrés riches en protéines pour soutenir la progression."],
  ]
  for (const [title, icon, content] of tips) {
    await conn.query('INSERT INTO tips (id, title, icon, content) VALUES (?, ?, ?, ?)', [uuid(), title, icon, content])
  }

  await conn.query(
    `INSERT INTO site_contents (\`key\`, \`value\`) VALUES
     ('contact_email', 'franciscourbron02@gmail.com'),
     ('contact_hours', 'Lun–Sam, 6h–19h'),
     ('contact_location', 'Canada')`,
  )

  console.log('→ Historique de poids et séance de démonstration pour Émilie...')
  const weights = [80, 78.5, 77.8, 77.1, 76.4]
  for (let i = 0; i < weights.length; i++) {
    await conn.query(
      'INSERT INTO body_measurements (id, user_id, weight, recorded_at) VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? WEEK))',
      [uuid(), client1Id, weights[i], weights.length - i],
    )
  }

  console.log('→ Commentaires clients publiés comme témoignages...')
  await conn.query(
    `INSERT INTO client_comments (id, user_id, content, is_published) VALUES
     (?, ?, 'Francis adapte vraiment le programme à mon rythme. En 3 mois j\\'ai vu une vraie différence.', 1),
     (?, ?, 'Le suivi est hyper précis — je vois mes progrès exercice par exercice, ça motive à fond.', 1)`,
    [uuid(), client1Id, uuid(), client2Id],
  )

  console.log('')
  console.log('✓ Seed terminé.')
  console.log(`  Admin  : ${process.env.SEED_ADMIN_EMAIL || 'francis@coach.bj'} / ${process.env.SEED_ADMIN_PASSWORD || 'admin2026'}`)
  console.log(`  Client : ${process.env.SEED_CLIENT_EMAIL || 'emilie.tremblay@example.com'} / ${process.env.SEED_CLIENT_PASSWORD || 'client2026'}`)

  await conn.end()
}

seed().catch((err) => {
  console.error('✗ Échec du seed :', err)
  process.exit(1)
})
