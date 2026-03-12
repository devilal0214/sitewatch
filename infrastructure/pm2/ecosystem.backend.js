// PM2 Ecosystem — JV SiteWatch Backend
// User   : apisi3307
// Domain : api.sitewatch.jaiveeru.site
// Path   : /home/api.sitewatch.jaiveeru.site/app/backend
// Port   : 4000

module.exports = {
  apps: [
    {
      name: 'sitewatch-backend',
      script: 'dist/index.js',
      cwd: '/home/api.sitewatch.jaiveeru.site/app/backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      error_file: '/home/api.sitewatch.jaiveeru.site/logs/backend-error.log',
      out_file: '/home/api.sitewatch.jaiveeru.site/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 5000,
      listen_timeout: 8000,
    },
  ],
};
