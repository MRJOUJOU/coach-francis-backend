-- =============================================================================
-- Migration 001 — Accès par client + titre de semaine
-- Compatible avec les données existantes (ADD COLUMN IF NOT EXISTS + CREATE IF NOT EXISTS)
-- =============================================================================

SET NAMES utf8mb4;

-- 1. Ajouter un titre personnalisable aux semaines (null = "Semaine N" par défaut)
ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS title VARCHAR(150) NULL AFTER number;

-- 2. Table d'accès / progression par client pour les SEMAINES
-- is_unlocked = 1 signifie que le client peut accéder à cette semaine
-- completed_at est renseigné quand toutes les journées de la semaine sont terminées
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

-- 3. Table d'accès par client pour les PROGRAMMES (défi extrême, etc.)
-- Permet un déverrouillage manuel ciblé sans toucher is_locked global
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

-- 4. Pour les clients existants : débloquer automatiquement la semaine 1 de chaque programme
-- (comportement historique : la première semaine était souvent accessible)
INSERT IGNORE INTO user_week_access (id, user_id, week_id, is_unlocked, unlocked_at)
SELECT
  UUID(),
  u.id,
  w.id,
  1,
  NOW()
FROM users u
CROSS JOIN weeks w
WHERE u.role = 'client'
  AND w.number = 1
  AND NOT EXISTS (
    SELECT 1 FROM user_week_access uwa
    WHERE uwa.user_id = u.id AND uwa.week_id = w.id
  );
