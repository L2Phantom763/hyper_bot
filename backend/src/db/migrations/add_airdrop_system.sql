-- =================================================================
-- Migration: Système d'Airdrop
-- Description: Ajoute les tables pour le système de points hebdomadaire
-- =================================================================

-- Table pour tracker les semaines de compétition
CREATE TABLE IF NOT EXISTS AirdropWeeks (
    id_week SERIAL PRIMARY KEY,
    week_number INT NOT NULL, -- Numéro de la semaine dans l'année
    year INT NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_points_distributed NUMERIC(36, 18) DEFAULT 1000000.0, -- 1M points par défaut
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (year, week_number)
);

-- Index pour rechercher la semaine active
CREATE INDEX idx_airdrop_weeks_status ON AirdropWeeks(status);

---

-- Table pour l'historique quotidien des points
CREATE TABLE IF NOT EXISTS DailyPoints (
    id_daily_point SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    week_id INT NOT NULL,
    date DATE NOT NULL,
    volume_traded NUMERIC(36, 18) DEFAULT 0.0, -- margin × leverage
    trades_count INT DEFAULT 0,
    profitable_trades INT DEFAULT 0,
    total_pnl NUMERIC(36, 18) DEFAULT 0.0,
    points_earned NUMERIC(36, 18) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_user
        FOREIGN KEY(user_id)
        REFERENCES Users(id_user)
        ON DELETE CASCADE,
        
    CONSTRAINT fk_week
        FOREIGN KEY(week_id)
        REFERENCES AirdropWeeks(id_week)
        ON DELETE CASCADE,
        
    UNIQUE (user_id, week_id, date)
);

-- Index pour accès rapide
CREATE INDEX idx_daily_points_user_week ON DailyPoints(user_id, week_id);
CREATE INDEX idx_daily_points_date ON DailyPoints(date);

---

-- Table pour le leaderboard hebdomadaire archivé
CREATE TABLE IF NOT EXISTS WeeklyLeaderboard (
    id_leaderboard SERIAL PRIMARY KEY,
    week_id INT NOT NULL,
    user_id INT NOT NULL,
    rank INT NOT NULL,
    total_volume NUMERIC(36, 18) DEFAULT 0.0,
    total_trades INT DEFAULT 0,
    total_pnl NUMERIC(36, 18) DEFAULT 0.0,
    points_earned NUMERIC(36, 18) DEFAULT 0.0,
    reward_amount NUMERIC(36, 18) DEFAULT 0.0, -- Montant de l'airdrop reçu
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_user
        FOREIGN KEY(user_id)
        REFERENCES Users(id_user)
        ON DELETE CASCADE,
        
    CONSTRAINT fk_week
        FOREIGN KEY(week_id)
        REFERENCES AirdropWeeks(id_week)
        ON DELETE CASCADE,
        
    UNIQUE (week_id, user_id)
);

-- Index pour rechercher le leaderboard d'une semaine
CREATE INDEX idx_weekly_leaderboard_week_rank ON WeeklyLeaderboard(week_id, rank);

---

-- Modifier la table Points pour ajouter le tracking hebdomadaire
ALTER TABLE Points ADD COLUMN IF NOT EXISTS weekly_points NUMERIC(36, 18) DEFAULT 0.0;
ALTER TABLE Points ADD COLUMN IF NOT EXISTS current_week_id INT;
ALTER TABLE Points ADD COLUMN IF NOT EXISTS total_volume NUMERIC(36, 18) DEFAULT 0.0;
ALTER TABLE Points ADD COLUMN IF NOT EXISTS last_daily_update DATE;

-- Ajouter la contrainte de clé étrangère
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_current_week'
    ) THEN
        ALTER TABLE Points 
        ADD CONSTRAINT fk_current_week
        FOREIGN KEY(current_week_id)
        REFERENCES AirdropWeeks(id_week)
        ON DELETE SET NULL;
    END IF;
END $$;

---

-- Initialiser la première semaine si elle n'existe pas
INSERT INTO AirdropWeeks (week_number, year, start_date, end_date, status)
SELECT 
    EXTRACT(WEEK FROM CURRENT_DATE)::INT,
    EXTRACT(YEAR FROM CURRENT_DATE)::INT,
    DATE_TRUNC('week', CURRENT_DATE),
    DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days',
    'active'
WHERE NOT EXISTS (SELECT 1 FROM AirdropWeeks WHERE status = 'active');

---

-- Message de fin
SELECT 'Airdrop system successfully created !' AS status;

