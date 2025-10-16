-- =================================================================
-- Migration: Distribution quotidienne fixe
-- Description: Ajoute la colonne pour tracker les points distribués quotidiennement
-- =================================================================

-- Ajouter la colonne points_distributed à DailyPoints
ALTER TABLE DailyPoints ADD COLUMN IF NOT EXISTS points_distributed NUMERIC(36, 18) DEFAULT 0.0;

-- Créer un index pour les requêtes de distribution
CREATE INDEX IF NOT EXISTS idx_daily_points_week_date ON DailyPoints(week_id, date);

-- Message de fin
SELECT 'Daily distribution migration successfully implemented !' AS status;

