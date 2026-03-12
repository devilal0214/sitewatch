module.exports = {
  apps: [
    {
      name: 'sitewatch-backend',
      cwd: '/home/sites.jaiveeru.site/public_html/sitewatch/backend',
      script: 'npx',
      args: 'ts-node-dev --respawn --transpile-only src/index.ts',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/sitewatch/backend-err.log',
      out_file: '/var/log/sitewatch/backend-out.log',
    },
    {
      name: 'sitewatch-frontend',
      cwd: '/home/sites.jaiveeru.site/public_html/sitewatch/frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/sitewatch/frontend-err.log',
      out_file: '/var/log/sitewatch/frontend-out.log',
    },
  ],
};
