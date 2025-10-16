# 🎮 Hunger Games Airdrop System

## Vue d'ensemble

Le système d'airdrop "Hunger Games" distribue **1,000,000 points chaque semaine** aux traders les plus actifs. Les points sont calculés en fonction du volume tradé, des trades profitables et du PnL.

## 📊 Fonctionnalités

### Pour les utilisateurs
- **Points quotidiens**: Les points sont calculés automatiquement chaque jour
- **Leaderboard**: Classement en temps réel des meilleurs traders
- **Stats personnelles**: Suivi de sa progression et de son rang
- **Distribution proportionnelle**: Plus vous tradez, plus votre part est importante

### Formule de calcul des points

```
Points = Volume Tradé + (Trades Profitables × 100) + (PnL Positif × 10)
```

Où:
- **Volume Tradé** = Margin × Leverage
- **Trades Profitables** = +100 points par trade avec PnL > 0
- **PnL Positif** = +10 points par $ de profit

## 🗄️ Structure de la base de données

### Tables créées

1. **AirdropWeeks** - Gestion des semaines de compétition
2. **DailyPoints** - Historique quotidien des points
3. **WeeklyLeaderboard** - Archives des classements hebdomadaires
4. **Points** (modifiée) - Ajout des colonnes pour le suivi hebdomadaire

## 🚀 Installation

### 1. Appliquer la migration SQL

```bash
psql -U votre_utilisateur -d votre_database -f backend/src/db/migrations/add_airdrop_system.sql
```

### 2. Vérifier la migration

```sql
-- Vérifier que les tables ont été créées
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('airdropweeks', 'dailypoints', 'weeklyleaderboard');

-- Vérifier la semaine active
SELECT * FROM AirdropWeeks WHERE status = 'active';
```

## ⚙️ Configuration des Cron Jobs

### 1. Mise à jour quotidienne (chaque jour à minuit)

```bash
# Ouvrir crontab
crontab -e

# Ajouter cette ligne (adapter le chemin)
0 0 * * * cd /Users/tom/Desktop/hyper_bot/backend && node src/scripts/daily_points_update.js >> /var/log/hyper_bot_daily.log 2>&1
```

### 2. Reset hebdomadaire (chaque lundi à minuit)

```bash
# Dans crontab, ajouter:
0 0 * * 1 cd /Users/tom/Desktop/hyper_bot/backend && node src/scripts/weekly_reset.js >> /var/log/hyper_bot_weekly.log 2>&1
```

### 3. Alternative: PM2 avec cron

```bash
# Installer pm2-cron
npm install -g pm2

# Créer un fichier ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'daily-points',
      script: './src/scripts/daily_points_update.js',
      cron_restart: '0 0 * * *',
      autorestart: false
    },
    {
      name: 'weekly-reset',
      script: './src/scripts/weekly_reset.js',
      cron_restart: '0 0 * * 1',
      autorestart: false
    }
  ]
};

# Démarrer
pm2 start ecosystem.config.js
```

## 📱 Commandes du Bot

### Pour les utilisateurs

| Commande | Description |
|----------|-------------|
| `/leaderboard` | Affiche le top 20 des traders de la semaine |
| `/mystats` | Affiche vos statistiques personnelles |
| `/rules` | Explique les règles du Hunger Games |

### Exemples d'utilisation

```
Utilisateur: /leaderboard
Bot: 🏆 HUNGER GAMES LEADERBOARD
     📅 Semaine 42 (14/10/2025 - 21/10/2025)
     💰 Pool: 1,000,000 points
     
     🥇 @trader1
        💎 45,232 pts | 📊 $12,450
     🥈 @trader2
        💎 38,901 pts | 📊 $9,800
     ...
```

```
Utilisateur: /mystats
Bot: 📊 VOS STATS HUNGER GAMES
     📅 Semaine 42 (14/10/2025 - 21/10/2025)
     
     🏅 Classement: #5 / 148
     💎 Points: 28,450
     📊 Volume tradé: $7,230
     📈 Part estimée: ~2.8450%
     
     💪 Top 10 ! Encore un effort pour le podium !
```

## 🔧 Tests manuels

### Tester le calcul des points quotidiens

```javascript
// Dans un script de test ou la console Node
import airdropService from './backend/src/services/airdropService.js';

// Calculer les points du jour
const result = await airdropService.calculateDailyPoints();
console.log(result);
// { updated: 5, date: '2025-10-15' }
```

### Tester le leaderboard

```javascript
// Obtenir le leaderboard actuel
const { week, leaderboard } = await airdropService.getCurrentLeaderboard(10);
console.log(leaderboard);
```

### Tester les stats d'un utilisateur

```javascript
// Remplacer par un vrai telegram_id
const stats = await airdropService.getUserWeeklyStats(123456789);
console.log(stats);
```

## 📈 Monitoring

### Vérifier les points quotidiens

```sql
-- Points calculés aujourd'hui
SELECT 
  u.username,
  dp.volume_traded,
  dp.trades_count,
  dp.points_earned,
  dp.date
FROM DailyPoints dp
JOIN Users u ON u.id_user = dp.user_id
WHERE dp.date = CURRENT_DATE
ORDER BY dp.points_earned DESC;
```

### Vérifier le leaderboard actuel

```sql
SELECT 
  u.username,
  p.weekly_points,
  p.total_volume,
  RANK() OVER (ORDER BY p.weekly_points DESC) as rank
FROM Points p
JOIN Users u ON u.id_user = p.user_id
WHERE p.weekly_points > 0
ORDER BY p.weekly_points DESC
LIMIT 20;
```

### Vérifier l'historique des semaines

```sql
-- Voir toutes les semaines complétées
SELECT 
  w.week_number,
  w.year,
  w.status,
  COUNT(wl.id_leaderboard) as participants,
  SUM(wl.reward_amount) as total_distributed
FROM AirdropWeeks w
LEFT JOIN WeeklyLeaderboard wl ON wl.week_id = w.id_week
WHERE w.status = 'completed'
GROUP BY w.id_week, w.week_number, w.year, w.status
ORDER BY w.year DESC, w.week_number DESC;
```

## 🐛 Dépannage

### Les points ne se calculent pas

1. Vérifier que les cron jobs tournent:
```bash
# Vérifier les logs
tail -f /var/log/hyper_bot_daily.log
```

2. Exécuter manuellement:
```bash
cd /Users/tom/Desktop/hyper_bot/backend
node src/scripts/daily_points_update.js
```

3. Vérifier la DB:
```sql
-- Y a-t-il des trades aujourd'hui?
SELECT COUNT(*) FROM Trades 
WHERE DATE(opened_at) = CURRENT_DATE OR DATE(closed_at) = CURRENT_DATE;
```

### Le reset hebdomadaire ne fonctionne pas

1. Vérifier la semaine active:
```sql
SELECT * FROM AirdropWeeks WHERE status = 'active';
```

2. Exécuter manuellement:
```bash
node src/scripts/weekly_reset.js
```

3. Vérifier les archives:
```sql
SELECT * FROM WeeklyLeaderboard ORDER BY created_at DESC LIMIT 10;
```

## 🎯 Personnalisation

### Modifier le pool de points

Dans `airdropService.js`, ligne ~185:
```javascript
const totalPointsPool = 1000000; // Changer cette valeur
```

### Modifier la formule de calcul

Dans `airdropService.js`, méthode `calculateUserDailyPoints`:
```javascript
// Formule actuelle
let pointsEarned = volumeTraded;
pointsEarned += profitableTrades * 100;
if (totalPnl > 0) {
  pointsEarned += totalPnl * 10;
}

// Exemple de formule alternative (plus de poids au PnL)
// let pointsEarned = volumeTraded * 0.5 + (totalPnl > 0 ? totalPnl * 50 : 0);
```

### Modifier le jour de reset

Par défaut le reset est le lundi (jour 1). Pour changer:
```bash
# Crontab (exemple pour dimanche = jour 0)
0 0 * * 0 cd /path/to/backend && node src/scripts/weekly_reset.js
```

## 📊 Métriques recommandées

### KPIs à suivre

1. **Nombre de participants par semaine**
2. **Volume total tradé**
3. **Distribution des points (Gini coefficient)**
4. **Taux de rétention hebdomadaire**

```sql
-- KPIs de la semaine en cours
WITH current_week AS (
  SELECT id_week FROM AirdropWeeks WHERE status = 'active'
)
SELECT 
  COUNT(DISTINCT user_id) as active_traders,
  SUM(volume_traded) as total_volume,
  SUM(trades_count) as total_trades,
  AVG(points_earned) as avg_points,
  MAX(points_earned) as max_points
FROM DailyPoints
WHERE week_id = (SELECT id_week FROM current_week);
```

## 🔐 Sécurité

- Les points sont calculés côté serveur (pas de manipulation client)
- Les timestamps sont en UTC pour éviter les problèmes de timezone
- Les transactions DB utilisent des contraintes pour éviter les duplications
- Le calcul est déterministe et auditable

## 📝 Logs

Les logs sont gérés par le logger du projet. Pour plus de détails:
```javascript
// Dans logger.js, ajuster le niveau de log si nécessaire
logger.level = 'info'; // ou 'debug' pour plus de détails
```

## 🚀 Prochaines améliorations possibles

- [ ] Dashboard web pour visualiser les stats
- [ ] Notifications push quotidiennes pour les top 10
- [ ] Bonus multiplicateurs pour streaks
- [ ] Système de badges/achievements
- [ ] API publique pour les stats
- [ ] Integration avec des outils d'analytics

## 📞 Support

En cas de problème, vérifier:
1. Les logs du bot
2. Les logs des cron jobs
3. L'état de la DB
4. Les versions des dépendances

Pour toute question, contacter l'équipe de développement.

