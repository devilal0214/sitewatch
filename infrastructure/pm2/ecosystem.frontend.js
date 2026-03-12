// PM2 Ecosystem — JV SiteWatch Frontend
// User   : sitew1875
// Domain : sitewatch.jaiveeru.site  (dashboard)
//          sites.jaiveeru.site      (public status pages — proxied here too)
// Path   : /home/sitewatch.jaiveeru.site/app/frontend
// Port   : 3000

module.exports = {
  apps: [
    {
      name: 'sitewatch-frontend',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/home/sitewatch.jaiveeru.site/app/frontend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '127.0.0.1',
      },
      error_file: '/home/sitewatch.jaiveeru.site/logs/frontend-error.log',
      out_file: '/home/sitewatch.jaiveeru.site/logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
