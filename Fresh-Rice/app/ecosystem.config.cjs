// Secrets are read from keys/ (gitignored) so they never land in git.
const read = (f) => { try { return require('fs').readFileSync(__dirname + '/keys/' + f, 'utf8').trim(); } catch { return ''; } };
// pm2 process definitions.
// Dev apps (default, always local, never sandbox) run via nest/next watch mode.
// interpreter:'none' is required because .bin/nest and .bin/next are shell shims,
// not JS files pm2 can require() directly.
// Prod apps (built) can be run with:
//   pm2 start ecosystem.config.cjs --only freshrice-api-prod,freshrice-web-prod
module.exports = {
  apps: [
    { name: 'freshrice-mcp', cwd: __dirname + '/apps/mcp', script: 'dist/index.js', args: '--http', env: { NODE_ENV: 'production', MCP_PORT: '4300', FRESHRICE_API_URL: 'http://localhost:4100', FRESHRICE_API_KEY: read('mcp-api-key.txt'), MCP_BEARER: read('mcp-bearer.txt') }, max_memory_restart: '300M', time: true },
    {
      name: 'freshrice-api',
      cwd: __dirname + '/apps/api',
      script: 'node_modules/.bin/nest',
      args: 'start --watch',
      interpreter: 'none',
      env: { NODE_ENV: 'development' },
      max_memory_restart: '600M',
      time: true,
    },
    {
      name: 'freshrice-web',
      cwd: __dirname + '/apps/web',
      script: 'node_modules/.bin/next',
      args: 'dev -p 4200',
      interpreter: 'none',
      env: { NODE_ENV: 'development' },
      max_memory_restart: '800M',
      time: true,
    },
    {
      name: 'freshrice-api-prod',
      cwd: __dirname + '/apps/api',
      script: 'dist/main.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '600M',
      time: true,
      autorestart: false,
    },
    {
      name: 'freshrice-web-prod',
      cwd: __dirname + '/apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 4200',
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '800M',
      time: true,
      autorestart: false,
    },
  ],
};
