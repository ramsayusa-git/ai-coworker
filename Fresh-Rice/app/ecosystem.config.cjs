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
      // Dev server with hot reload. next dev leaks under memory pressure (hit 2.4 GB on 19 Sep with swap
      // exhausted) — so cap the heap, restart at 1.2 GB, and let pm2 bring it back in seconds instead of
      // leaving :4200 dead. Never run this and freshrice-web-prod at the same time.
      name: 'freshrice-web',
      cwd: __dirname + '/apps/web',
      script: 'node_modules/.bin/next',
      args: 'dev -p 4200',
      interpreter: 'none',
      env: { NODE_ENV: 'development', WEB_PORT: '4200', API_INTERNAL_URL: 'http://localhost:4100', NODE_OPTIONS: '--max-old-space-size=1536' },
      max_memory_restart: '1200M',
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 100,
      time: true,
      out_file: __dirname + '/logs/web.log',
      error_file: __dirname + '/logs/web.log',
      merge_logs: true,
    },
    // Built apps. autorestart:true + memory caps so a crash or leak is recovered in seconds
    // instead of leaving the site down until someone notices.
    {
      name: 'freshrice-api-prod',
      cwd: __dirname + '/apps/api',
      script: 'dist/main.js',
      node_args: '--enable-source-maps',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '700M',
      time: true,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 50,
      out_file: __dirname + '/logs/api.log',
      error_file: __dirname + '/logs/api.log',
      merge_logs: true,
    },
    {
      name: 'freshrice-web-prod',
      cwd: __dirname + '/apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 4200',
      interpreter: 'none',
      env: { NODE_ENV: 'production', WEB_PORT: '4200', API_INTERNAL_URL: 'http://localhost:4100' },
      max_memory_restart: '900M',
      time: true,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 50,
      out_file: __dirname + '/logs/web.log',
      error_file: __dirname + '/logs/web.log',
      merge_logs: true,
    },
  ],
};
