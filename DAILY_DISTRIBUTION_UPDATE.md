# 🔄 Update: Distribution quotidienne fixe

## Changement majeur

Le système est passé d'une **accumulation hebdomadaire** à une **distribution quotidienne fixe**.

### Avant (Système d'accumulation)
- Les users accumulaient des points toute la semaine
- Distribution de 1M points le dimanche soir proportionnellement
- **Problème**: Les "early birds" avaient un avantage

### Maintenant (Distribution quotidienne)
- **142,857 points distribués chaque jour** (1M / 7)
- Distribution immédiate basée sur l'activité du jour
- **Avantage**: Tout le monde a une chance équitable chaque jour

## Comment ça marche maintenant

### 1. Calcul de l'activité (shares)
```
Activity Score = Volume tradé + (Trades profitables × 100) + (PnL positif × 10)

Où:
- Volume tradé = margin × leverage
- Trades profitables = nombre de trades avec PnL > 0
- PnL positif = somme des profits en $
```

### 2. Distribution quotidienne (minuit)
```
User Share = (User Activity / Total Activity) × 142,857 points

Exemple avec 3 traders:
- User A: 50,000 activity → (50k/100k) × 142,857 = 71,428 pts ✓
- User B: 30,000 activity → (30k/100k) × 142,857 = 42,857 pts ✓
- User C: 20,000 activity → (20k/100k) × 142,857 = 28,571 pts ✓
Total: 142,857 points distribués ✓
```

### 3. Accumulation hebdomadaire
- Les points sont ajoutés immédiatement à `Points.points`
- Le compteur `weekly_points` track le total de la semaine
- Le dimanche soir: archive + reset des compteurs

## Installation

### 1. Appliquer la nouvelle migration
```bash
cd /Users/tom/Desktop/hyper_bot/backend
psql -U user -d database -f src/db/migrations/update_daily_distribution.sql
```

Cette migration ajoute:
- Colonne `points_distributed` à `DailyPoints`
- Index pour optimiser les requêtes

### 2. Redémarrer le bot
```bash
pm2 restart hyper-bot
```

### 3. Les cron jobs restent identiques
```bash
# Quotidien à minuit
0 0 * * * node src/scripts/daily_points_update.js

# Hebdo le lundi
0 0 * * 1 node src/scripts/weekly_reset.js
```

## Fichiers modifiés

1. **`backend/src/services/airdropService.js`**
   - `calculateDailyPoints()` - Distribution immédiate
   - `calculateUserDailyActivity()` - Renommé, retourne juste l'activity score
   - `weeklyReset()` - Simplifié, archive seulement

2. **`backend/src/bot/leaderboard.js`**
   - Message leaderboard: "Daily distribution: ~142,857 points"
   - `/rules` mis à jour avec la nouvelle logique

3. **`backend/src/scripts/daily_points_update.js`**
   - Logs mis à jour: "Distribution completed"

4. **`backend/src/db/migrations/update_daily_distribution.sql`**
   - Nouvelle migration pour la colonne `points_distributed`

## Vérification

### Base de données
```sql
-- Vérifier la nouvelle colonne
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'dailypoints' AND column_name = 'points_distributed';

-- Voir les distributions du jour
SELECT 
  u.username,
  dp.points_earned as activity_score,
  dp.points_distributed as received,
  dp.date
FROM DailyPoints dp
JOIN Users u ON u.id_user = dp.user_id
WHERE dp.date = CURRENT_DATE
ORDER BY dp.points_distributed DESC;
```

### Test manuel
```bash
# Simuler une distribution
node src/scripts/daily_points_update.js

# Devrait afficher:
# ✅ Distribution completed: X users, 142857.00 points distributed for YYYY-MM-DD
```

## Impact sur les users

### Messages visibles
- **Leaderboard**: "Daily distribution: ~142,857 points"
- **Rules**: Explique le nouveau système de shares quotidiennes
- Le reste reste identique (`/mystats`, classement, etc.)

### Expérience
- ✅ Plus équitable jour par jour
- ✅ Pas d'avantage aux "early birds"
- ✅ Chaque jour est une nouvelle opportunité
- ✅ Pool garanti de 142,857 pts/jour

## Notes importantes

1. **Pool quotidien fixe**: Exactement 142,857 points distribués chaque jour où il y a de l'activité
2. **Pas de trades = pas de distribution**: Si personne ne trade un jour, les points ne sont pas distribués
3. **Weekly total**: ~1M points par semaine si distribution chaque jour
4. **Backwards compatible**: Les anciennes données restent valides

## Rollback (si nécessaire)

Si vous voulez revenir à l'ancien système:
```bash
# 1. Restaurer le fichier
git checkout HEAD~1 backend/src/services/airdropService.js

# 2. Supprimer la colonne (optionnel)
psql -c "ALTER TABLE DailyPoints DROP COLUMN IF EXISTS points_distributed;"

# 3. Redémarrer
pm2 restart hyper-bot
```

## Questions fréquentes

**Q: Que se passe-t-il si personne ne trade un jour?**
R: Aucune distribution ce jour-là. Les 142,857 points ne sont pas "perdus", ils ne sont simplement pas distribués.

**Q: Le total hebdo est toujours 1M?**
R: Oui, si distribution chaque jour. Si pas d'activité certains jours, le total sera moins.

**Q: Les anciens points sont perdus?**
R: Non, tous les points déjà attribués restent intacts.

**Q: Puis-je changer le pool quotidien?**
R: Oui, modifiez `const dailyPool = 142857;` dans `airdropService.js`

---

**Système mis à jour et prêt!** 🚀

Plus équitable, plus compétitif chaque jour, et techniquement plus solide.

