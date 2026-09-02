# Coach Francis Courbron — Backend API

API Node.js + Express + MySQL pour la plateforme de coaching. Authentification
JWT (access token + refresh token en cookie httpOnly), upload d'images,
messagerie et notifications en temps réel via Socket.IO, rappels
d'abonnement automatiques, défis multiples avec déblocage de palier,
invitations d'inscription par email (mailto, sans SMTP).

## Prérequis

- Node.js 18+
- MySQL ou MariaDB (10.6+ / 8+) démarré et accessible

## Installation

```bash
npm install
cp .env.example .env
# éditer .env : DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, secrets JWT...
```

Créer la base et l'utilisateur (exemple) :

```sql
CREATE DATABASE coach_francis_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cf_app'@'localhost' IDENTIFIED BY 'un_mot_de_passe_solide';


```

Appliquer le schéma puis les données de démonstration :

```bash
npm run db:migrate
npm run db:seed
```

## Démarrer

```bash
npm run dev     # avec rechargement automatique (nodemon)
npm start       # production
```

L'API écoute sur `http://localhost:4000` (configurable via `PORT`).
Vérification rapide : `curl http://localhost:4000/health`.

Au démarrage, deux tâches planifiées s'exécutent (tous les jours à 7h/8h +
immédiatement au lancement) :
- rappel d'abonnement à J-7
- rappel de séance personnelle planifiée le jour même

## Comptes de démonstration (créés par `npm run db:seed`)

| Rôle   | Email                       | Mot de passe |
|--------|------------------------------|--------------|
| Admin  | francis@coach.bj             | admin2026    |
| Client | emilie.tremblay@example.com  | client2026   |
| Client | marc.gagnon@example.com      | client2026   |

## Structure

```
src/
 ├─ config/db.js            Pool de connexion MySQL
 ├─ middlewares/            auth (JWT), auth optionnelle, rôles, upload, erreurs
 ├─ controllers/            logique métier par domaine
 ├─ routes/                 découpage des routes Express
 ├─ sockets/                Socket.IO authentifié par JWT (messages + notifications live)
 ├─ jobs/                   tâches planifiées (abonnement J-7, séances planifiées)
 ├─ app.js                  assemblage Express (middlewares + routes)
 └─ server.js               point d'entrée (HTTP + sockets + DB + cron)
database/
 ├─ schema.sql               17 tables normalisées
 ├─ migrate.js               applique schema.sql
 └─ seed.js                  données de démonstration
uploads/                     images uploadées (jours, exercices, avatars) — servi sur /uploads
```

## Sécurité mise en place

- Mots de passe hashés avec bcrypt (jamais stockés en clair)
- JWT access token (15 min) + refresh token en cookie **httpOnly** (30 jours)
- Toutes les routes sensibles vérifient le rôle **côté serveur**
  (`requireRole`, `requireSelfOrAdmin`) — un client ne peut jamais accéder
  aux données d'un autre client ou aux routes admin
- Le bloc-notes du client est consultable par l'admin/coach (l'interface le
  précise clairement au client, aucune fausse promesse de confidentialité)
- Upload d'images : type MIME vérifié, taille limitée à 5 Mo, noms de
  fichiers générés (UUID)
- Invitations d'inscription : token aléatoire 48 octets, expiration à 72h,
  usage unique — **aucun identifiant SMTP/Gmail stocké**, l'admin envoie
  lui-même le message via un lien `mailto:` pré-rempli
- `helmet` pour les en-têtes HTTP de sécurité, CORS restreint à l'origine du
  frontend avec `credentials: true`

## Fonctionnalités notables de cette version

### Séances — validation série par série
`workout_sessions` / `exercise_performances` (une ligne par **série**) /
`exercise_reports` (commentaire par exercice). Le rapport de fin de séance
est calculé côté serveur (volume total, séries/exercices terminés, durée,
**détection automatique de nouveaux records**) — source unique de vérité,
jamais dupliquée côté frontend.

### Trois images distinctes par journée
`workout_days.image_url` (image principale), `summary_image_url` (grande
image récapitulative, ratio original conservé côté frontend, pas de
recadrage forcé), et l'image de chaque `exercises.image_url` utilisée
pendant l'entraînement — gérées indépendamment depuis l'admin.

### Défis multiples avec déblocage de palier
`programs.type = 'challenge'` peut exister en plusieurs exemplaires
(ex. Défi Complet, Défi Extrême). `unlock_after_program_id` référence le
programme prérequis ; un défi est effectivement débloqué pour un client
quand tous les jours du programme prérequis ont une séance complétée par ce
client — sauf si `is_locked = 1` (verrouillage manuel admin, toujours
prioritaire).

### Bloc-notes en 3 volets
- `notes` : historique **jamais écrasé** (une ligne par saisie), consultable
  par le client et l'admin/coach
- `exercise_logs` : journal d'entraînement structuré (le tableau "type
  Excel"), volume et progression % calculés à la lecture
- Message au coach : réutilise le système de messagerie existant

### Commentaires clients → témoignages
`client_comments` : privé par défaut (`is_published = 0`), l'admin peut le
publier comme témoignage public via `PUT /comments/admin/:id/publish`.

### Planification personnelle
`planned_sessions` : le client programme une future séance libre (ex.
"Cardio — vélo", 5 septembre), reçoit une notification le jour J.

## Principales routes

```
POST   /auth/login | /auth/refresh | /auth/logout | /auth/onboarding
GET    /auth/me                          PUT /auth/me (nom/email/mot de passe)
POST   /auth/me/photo                    (upload avatar)

GET    /admin/users                      POST /admin/users
GET    /admin/users/:id                  GET /admin/users/:id/stats
PUT    /admin/users/:id                  DELETE /admin/users/:id

GET    /programs                         (public, auth optionnelle pour le déblocage de palier)
POST   /admin/programs                   PUT /admin/programs/:id/toggle-lock
POST   /admin/programs/:id/weeks         PUT /admin/weeks/:id/toggle-lock
POST   /admin/weeks/:id/days             PUT/DELETE /admin/days/:id
POST   /admin/days/:id/image             POST /admin/days/:id/summary-image
POST   /admin/days/:id/exercises         PUT/DELETE /admin/exercises/:id

POST   /workouts/start
GET    /workouts/last-performance/:exerciseId
POST   /workouts/:sessionId/report       (sets détaillés + résumé calculé)
GET    /workouts/user/:userId            GET /workouts (admin)

GET/POST /progress/:userId/weight
GET/POST /progress/:userId/notes         (historique, visible client + admin)
GET/POST /progress/:userId/exercise-log  DELETE /progress/exercise-log/:id

GET/POST /planned-sessions/:userId       PUT/DELETE /planned-sessions/item/:id

GET  /messages/mine | /messages/admin/conversations    POST /messages
GET  /notifications                      PUT /notifications/:id/read

POST /comments                           GET /comments/published (public)
GET  /comments/admin/all                 PUT /comments/admin/:id/publish

POST /invitations (admin)                GET /invitations/:token (public)
POST /invitations/:token/accept (public)

GET/POST/PUT/DELETE /tips                GET/PUT /site-content
```

## Événements Socket.IO

```
notification:new              vers la room user:<id>
message:new  { conversationId }   vers la room conversation:<id>
conversation:join / conversation:leave
```

## Notifications push (Web Push)

Clés VAPID générées et prêtes dans `.env.example` pour le développement
(à régénérer pour la production avec `npx web-push generate-vapid-keys`).

- `GET /push/vapid-public-key` — clé publique (le frontend l'utilise pour s'abonner)
- `POST /push/subscribe` / `POST /push/unsubscribe` — enregistre/retire l'abonnement d'un appareil
- `src/utils/notify.js` centralise **toute** création de notification : elle
  écrit en base, la pousse en temps réel via Socket.IO, et envoie une
  notification push à chaque appareil abonné de l'utilisateur — un seul
  point d'entrée, jamais de logique dupliquée entre les contrôleurs
- Un envoi push échoué (abonnement expiré/révoqué) est intercepté
  silencieusement et l'abonnement obsolète est supprimé automatiquement

## Ce qu'il reste à améliorer

- Bibliothèque d'exercices réutilisables (many-to-many entre exercices et
  jours) pour une rotation encore plus fine — actuellement l'admin assigne
  déjà librement quel exercice va sur quelle journée, mais chaque entrée est
  dupliquée plutôt que référencée
- Pagination sur les listes volumineuses (rapports, séances)
- Tests automatisés (validation actuelle manuelle mais systématique)
