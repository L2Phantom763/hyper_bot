module.exports = {
  apps: [
    {
      name: 'hyper-bot',
      script: './src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'daily-points-update',
      script: './src/scripts/daily_points_update.js',
      cron_restart: '0 0 * * *', // Chaque jour à minuit
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'weekly-reset',
      script: './src/scripts/weekly_reset.js',
      cron_restart: '0 0 * * 1', // Chaque lundi à minuit
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};

