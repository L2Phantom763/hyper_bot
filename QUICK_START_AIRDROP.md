# 🚀 Quick Start - Système Airdrop Hunger Games

## Installation en 5 minutes

### Étape 1: Appliquer la migration SQL

```bash
cd /Users/tom/Desktop/hyper_bot/backend

# Se connecter à PostgreSQL et exécuter la migration
psql -U votre_utilisateur -d votre_database -f src/db/migrations/add_airdrop_system.sql
```

✅ **Vérification**: Les tables suivantes doivent être créées:
- `AirdropWeeks`
- `DailyPoints`
- `WeeklyLeaderboard`
- Colonnes ajoutées à `Points`

### Étape 2: Tester le système

```bash
# Lancer le test
node src/scripts/test_airdrop.js
```

Vous devriez voir:
```
🧪 Test du système d'airdrop Hunger Games
==================================================

📅 Test 1: Semaine active
✅ Semaine: { id: 1, number: 42, year: 2025, status: 'active', ... }

🏆 Test 2: Leaderboard actuel
⚠️  Aucun trader actif cette semaine

📊 Test 3: Calcul des points quotidiens
✅ Points calculés pour 0 utilisateurs

==================================================
✅ Tous les tests sont passés!
```

### Étape 3: Configurer les cron jobs

**Option A: Crontab classique**

```bash
# Ouvrir crontab
crontab -e

# Ajouter ces lignes (adapter le chemin):
0 0 * * * cd /Users/tom/Desktop/hyper_bot/backend && node src/scripts/daily_points_update.js >> /tmp/daily_points.log 2>&1
0 0 * * 1 cd /Users/tom/Desktop/hyper_bot/backend && node src/scripts/weekly_reset.js >> /tmp/weekly_reset.log 2>&1
```

**Option B: PM2 (recommandé)**

```bash
# Installer PM2 si pas déjà fait
npm install -g pm2

# Dans le dossier backend, lancer:
cd /Users/tom/Desktop/hyper_bot/backend
pm2 start ecosystem.config.js

# Vérifier que tout tourne
pm2 list

# Sauvegarder pour redémarrage auto
pm2 save
pm2 startup
```

### Étape 4: Les utilisateurs peuvent commencer à utiliser!

Les commandes sont automatiquement disponibles:

```
/leaderboard - Voir le classement
/mystats - Voir ses stats
/rules - Voir les règles
```

## 🎯 Comment ça marche

### Pour les users

1. **Trader normalement** avec `/long` ou `/short`
2. **Accumuler des points** automatiquement:
   - Volume tradé (margin × leverage)
   - +100 pts par trade profitable
   - +10 pts par $ de PnL positif
3. **Voir sa progression** avec `/mystats`
4. **Gagner sa part** des 1M points chaque semaine

### Calcul automatique

- **Chaque jour à minuit**: Les points sont calculés pour tous les traders
- **Chaque lundi à minuit**: Reset hebdomadaire et distribution des rewards
- Les users peuvent vérifier leur position à tout moment

## 📊 Monitoring

### Vérifier que les cron jobs tournent

```bash
# Avec PM2
pm2 logs daily-points-update
pm2 logs weekly-reset

# Avec crontab
tail -f /tmp/daily_points.log
tail -f /tmp/weekly_reset.log
```

### Vérifier l'état de la DB

```sql
-- Semaine active
SELECT * FROM AirdropWeeks WHERE status = 'active';

-- Top 10 traders
SELECT 
  u.username,
  p.weekly_points,
  p.total_volume
FROM Points p
JOIN Users u ON u.id_user = p.user_id
WHERE p.weekly_points > 0
ORDER BY p.weekly_points DESC
LIMIT 10;

-- Points d'aujourd'hui
SELECT 
  u.username,
  dp.points_earned,
  dp.volume_traded,
  dp.trades_count
FROM DailyPoints dp
JOIN Users u ON u.id_user = dp.user_id
WHERE dp.date = CURRENT_DATE
ORDER BY dp.points_earned DESC;
```

### Tester manuellement

```bash
# Calculer les points maintenant (sans attendre minuit)
node src/scripts/daily_points_update.js

# Simuler un reset hebdomadaire (ATTENTION: ceci archive la semaine actuelle!)
# node src/scripts/weekly_reset.js
```

## 🔧 Personnalisation

### Changer le pool de points

Dans `src/services/airdropService.js`:
```javascript
// Ligne ~187
const totalPointsPool = 1000000; // Changer ici
```

### Changer la formule de calcul

Dans `src/services/airdropService.js`, méthode `calculateUserDailyPoints`:
```javascript
// Ligne ~107
let pointsEarned = volumeTraded;
pointsEarned += profitableTrades * 100;  // Modifier ce bonus
if (totalPnl > 0) {
  pointsEarned += totalPnl * 10;  // Modifier ce multiplicateur
}
```

### Changer les messages du bot

Modifier les fichiers dans `src/bot/leaderboard.js`

## ❓ FAQ

**Q: Les points ne se calculent pas**
```bash
# Vérifier qu'il y a des trades
psql -c "SELECT COUNT(*) FROM Trades WHERE DATE(opened_at) = CURRENT_DATE;"

# Exécuter manuellement
node src/scripts/daily_points_update.js

# Vérifier les logs
pm2 logs daily-points-update --lines 50
```

**Q: Comment voir l'historique des semaines passées?**
```sql
SELECT 
  w.week_number,
  w.year,
  COUNT(wl.user_id) as participants,
  SUM(wl.reward_amount) as total_distributed
FROM AirdropWeeks w
LEFT JOIN WeeklyLeaderboard wl ON wl.week_id = w.id_week
WHERE w.status = 'completed'
GROUP BY w.id_week, w.week_number, w.year
ORDER BY w.year DESC, w.week_number DESC;
```

**Q: Puis-je modifier une semaine en cours?**

Oui, mais faites attention:
```sql
-- Recalculer tous les points de la semaine
-- (exécuter daily_points_update pour chaque jour de la semaine)
```

**Q: Comment archiver manuellement une semaine?**
```bash
node src/scripts/weekly_reset.js
```

## 🎨 Améliorations futures

- [ ] Dashboard web pour les stats
- [ ] Notifications push pour les changements de rang
- [ ] Bonus pour séries de trades profitables
- [ ] Système de badges
- [ ] API publique

## 📞 Support

Pour plus de détails, voir `AIRDROP_SETUP.md`

---

**Prêt à lancer?** 🚀

1. ✅ Migration SQL appliquée
2. ✅ Tests passés
3. ✅ Cron jobs configurés
4. ✅ Bot redémarré

**C'est parti!** Les users peuvent maintenant trader et accumuler des points! 🎮

