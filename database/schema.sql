-- =============================================================================
-- Coach Francis Courbron — Schéma de base de données
-- MySQL / MariaDB — utf8mb4
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- users — comptes admin & clients
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                CHAR(36)      NOT NULL PRIMARY KEY,
  first_name        VARCHAR(100)  NOT NULL,
  last_name         VARCHAR(100)  NOT NULL,
  email             VARCHAR(190)  NOT NULL UNIQUE,
  password_hash     VARCHAR(255)  NOT NULL,
  role              ENUM('admin','client') NOT NULL DEFAULT 'client',
  status            ENUM('active','inactive') NOT NULL DEFAULT 'active',
  avatar_color      VARCHAR(9)    DEFAULT '#3d7fff',
  avatar_url        VARCHAR(500)  NULL,
  subscription_end  DATETIME      NULL,
  has_onboarded     TINYINT(1)    NOT NULL DEFAULT 0,
  height_cm         DECIMAL(5,1)  NULL,
  goals             VARCHAR(500)  NULL,
  last_login_at     DATETIME      NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- refresh_tokens — pour la rotation des sessions JWT
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  user_id     CHAR(36)     NOT NULL,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked     TINYINT(1)   NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_user (user_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- programs — Programme Hebdomadaire / Défi Complet / futurs programmes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS programs (
  id          CHAR(36)      NOT NULL PRIMARY KEY,
  title       VARCHAR(150)  NOT NULL,
  description TEXT          NULL,
  image_url   VARCHAR(500)  NULL,
  type        ENUM('weekly','challenge') NOT NULL DEFAULT 'weekly',
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  is_locked   TINYINT(1)    NOT NULL DEFAULT 0,
  unlock_after_program_id CHAR(36) NULL,
  display_order INT         NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (unlock_after_program_id) REFERENCES programs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- weeks — semaines d'un programme, verrouillables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weeks (
  id          CHAR(36)  NOT NULL PRIMARY KEY,
  program_id  CHAR(36)  NOT NULL,
  number      INT       NOT NULL,
  title       VARCHAR(150) NULL,
  is_locked   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_program_week (program_id, number)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- workout_days — jours d'une semaine
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_days (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  week_id       CHAR(36)      NOT NULL,
  day_number    INT           NOT NULL,
  title         VARCHAR(150)  NOT NULL,
  subtitle      VARCHAR(200)  NULL,
  description   TEXT          NULL,
  image_url     VARCHAR(500)  NULL,
  summary_image_url VARCHAR(500) NULL,
  category      ENUM('strength','cardio','flexibility') NOT NULL DEFAULT 'strength',
  display_order INT           NOT NULL DEFAULT 0,
  status        ENUM('active','draft') NOT NULL DEFAULT 'active',
  is_optional   TINYINT(1)    NOT NULL DEFAULT 0,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (week_id) REFERENCES weeks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- exercises — exercices d'un jour
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
  id                  CHAR(36)      NOT NULL PRIMARY KEY,
  day_id              CHAR(36)      NOT NULL,
  name                VARCHAR(150)  NOT NULL,
  description         TEXT          NULL,
  image_url           VARCHAR(500)  NULL,
  sets                INT           NOT NULL DEFAULT 3,
  reps                VARCHAR(50)   NULL,
  duration            VARCHAR(50)   NULL,
  recommended_weight  VARCHAR(50)   NULL,
  display_order       INT           NOT NULL DEFAULT 0,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (day_id) REFERENCES workout_days(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- workout_sessions — une séance démarrée par un client
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_sessions (
  id          CHAR(36)  NOT NULL PRIMARY KEY,
  user_id     CHAR(36)  NOT NULL,
  day_id      CHAR(36)  NOT NULL,
  started_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at    DATETIME  NULL,
  status      ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  client_remark TEXT    NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (day_id) REFERENCES workout_days(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_day (day_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- exercise_performances — une ligne par SÉRIE réalisée (permet la validation
-- série par série pendant l'entraînement, avec poids/répétitions par série)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercise_performances (
  id            CHAR(36)  NOT NULL PRIMARY KEY,
  session_id    CHAR(36)  NOT NULL,
  exercise_id   CHAR(36)  NOT NULL,
  set_number    INT       NOT NULL DEFAULT 1,
  weight        VARCHAR(50) NULL,
  reps          INT       NULL,
  done          TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  INDEX idx_perf_exercise_created (exercise_id, created_at)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- exercise_reports — une ligne par EXERCICE d'une séance (difficulté/commentaire
-- global de l'exercice, distinct du détail série par série ci-dessus)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercise_reports (
  id            CHAR(36)  NOT NULL PRIMARY KEY,
  session_id    CHAR(36)  NOT NULL,
  exercise_id   CHAR(36)  NOT NULL,
  difficulty    ENUM('facile','moyen','difficile') NULL,
  comment       TEXT      NULL,
  created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_session_exercise (session_id, exercise_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- body_measurements — historique de poids
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS body_measurements (
  id           CHAR(36)  NOT NULL PRIMARY KEY,
  user_id      CHAR(36)  NOT NULL,
  weight       DECIMAL(5,1) NOT NULL,
  recorded_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_measurements_user (user_id, recorded_at)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- notes — bloc-notes du client, avec historique conservé (jamais écrasé).
-- Consultable par le coach/admin : l'interface le dit clairement au client.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id          CHAR(36)  NOT NULL PRIMARY KEY,
  user_id     CHAR(36)  NOT NULL,
  content     TEXT      NOT NULL,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notes_user (user_id, created_at)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- exercise_logs — journal d'entraînement structuré tenu par le client lui-même
-- (le tableau "type Excel" : date/exercice/poids/reps/séries/volume/commentaire)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercise_logs (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  user_id       CHAR(36)      NOT NULL,
  log_date      DATE          NOT NULL,
  exercise_name VARCHAR(150)  NOT NULL,
  first_weight  DECIMAL(6,1)  NULL,
  last_weight   DECIMAL(6,1)  NULL,
  reps          INT           NULL,
  sets          INT           NULL,
  comment       VARCHAR(300)  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_exlog_user_date (user_id, log_date)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- conversations / messages — messagerie client <-> admin
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id          CHAR(36)  NOT NULL PRIMARY KEY,
  client_id   CHAR(36)  NOT NULL UNIQUE,
  updated_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id              CHAR(36)  NOT NULL PRIMARY KEY,
  conversation_id CHAR(36)  NOT NULL,
  sender_id       CHAR(36)  NOT NULL,
  sender_role     ENUM('admin','client') NOT NULL,
  content         TEXT      NOT NULL,
  is_read         TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_messages_conv (conversation_id, created_at)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          CHAR(36)  NOT NULL PRIMARY KEY,
  user_id     CHAR(36)  NOT NULL,
  type        ENUM('message','report','week_unlocked','reminder','subscription','new_client') NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(500) NULL,
  link        VARCHAR(300) NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, created_at)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- tips — conseils
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tips (
  id          CHAR(36)      NOT NULL PRIMARY KEY,
  title       VARCHAR(150)  NOT NULL,
  icon        VARCHAR(50)   NOT NULL DEFAULT 'flame',
  content     TEXT          NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- site_contents — clé/valeur pour contact, textes éditables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_contents (
  `key`       VARCHAR(100) NOT NULL PRIMARY KEY,
  `value`     TEXT         NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- activity_logs — connexions, heartbeats d'activité, événements de séance
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id          CHAR(36)  NOT NULL PRIMARY KEY,
  user_id     CHAR(36)  NOT NULL,
  event_type  ENUM('login','heartbeat','session_start','session_end') NOT NULL,
  meta        JSON      NULL,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_activity_user_type (user_id, event_type, created_at)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- planned_sessions — le client programme lui-même une future séance
-- (ex : "vendredi 5/09, cardio vélo") et reçoit une notification le jour J
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planned_sessions (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  user_id         CHAR(36)     NOT NULL,
  title           VARCHAR(150) NOT NULL,
  activity_type   VARCHAR(50)  NULL,
  notes           TEXT         NULL,
  image_url       VARCHAR(500) NULL,
  scheduled_date  DATE         NOT NULL,
  scheduled_time  TIME         NULL,
  status          ENUM('planned','done','missed') NOT NULL DEFAULT 'planned',
  notified        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_planned_user_date (user_id, scheduled_date)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- client_comments — commentaire envoyé par un client à son coach, privé par
-- défaut ; l'admin peut le publier comme témoignage public sur la page d'accueil
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_comments (
  id            CHAR(36)  NOT NULL PRIMARY KEY,
  user_id       CHAR(36)  NOT NULL,
  content       TEXT      NOT NULL,
  is_published  TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_comments_published (is_published)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- invitations — lien d'inscription envoyé par l'admin (mailto pré-rempli),
-- le client finalise lui-même son compte (nom + mot de passe) via le lien
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  token           VARCHAR(64)  NOT NULL UNIQUE,
  email           VARCHAR(190) NOT NULL,
  subscription_end DATETIME    NULL,
  used            TINYINT(1)   NOT NULL DEFAULT 0,
  expires_at      DATETIME     NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invitations_token (token)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- push_subscriptions — abonnements Web Push par appareil (plusieurs par user)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  user_id     CHAR(36)     NOT NULL,
  endpoint    VARCHAR(500) NOT NULL,
  p256dh      VARCHAR(255) NOT NULL,
  auth        VARCHAR(255) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_endpoint (endpoint(255))
) ENGINE=InnoDB;


-- -----------------------------------------------------------------------------
-- user_week_access — accès / progression d'un client sur une semaine précise
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_week_access (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  user_id       CHAR(36)      NOT NULL,
  week_id       CHAR(36)      NOT NULL,
  is_unlocked   TINYINT(1)    NOT NULL DEFAULT 0,
  unlocked_at   DATETIME      NULL,
  completed_at  DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_week (user_id, week_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (week_id) REFERENCES weeks(id) ON DELETE CASCADE,
  INDEX idx_uwa_user (user_id),
  INDEX idx_uwa_week (week_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- user_program_access — déverrouillage manuel ciblé d'un programme pour un client
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_program_access (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  user_id       CHAR(36)      NOT NULL,
  program_id    CHAR(36)      NOT NULL,
  is_unlocked   TINYINT(1)    NOT NULL DEFAULT 0,
  unlocked_at   DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_program (user_id, program_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  INDEX idx_upa_user (user_id),
  INDEX idx_upa_program (program_id)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
