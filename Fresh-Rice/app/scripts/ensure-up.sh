#!/usr/bin/env bash
# FreshRice watchdog — run from cron every 2 minutes.
# Re-launches any FreshRice PM2 app that is missing or not online, and verifies HTTP.
# This survives another project on the same box running `pm2 delete all` / `pm2 kill`.
set -u
APP=/home/krishna/ai-work-space/ai-coworker/Fresh-Rice/app
export PATH="$HOME/.local/share/pnpm:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
LOG="$APP/logs/watchdog.log"
ts() { date '+%F %T'; }

need=""
# WEB_APP: freshrice-web (next dev, hot reload) or freshrice-web-prod (next start). Keep in sync with what pm2 runs.
WEB_APP=freshrice-web
for name in freshrice-api-prod $WEB_APP freshrice-mcp; do
  st=$(pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const p=JSON.parse(d||"[]").find(x=>x.name===process.argv[1]);console.log(p?p.pm2_env.status:"missing")})' "$name" 2>/dev/null)
  [ "$st" = "online" ] || need="$need,$name"
done

if [ -n "$need" ]; then
  need=${need#,}
  echo "$(ts) not online: $need — relaunching" >> "$LOG"
  cd "$APP" && pm2 start ecosystem.config.cjs --only "$need" >> "$LOG" 2>&1 && pm2 save >> "$LOG" 2>&1
fi

# HTTP probes (PM2 can say "online" while the port is dead, e.g. EADDRINUSE loop)
w=$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://localhost:4200/ || echo 000)
a=$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://localhost:4100/v1/auth/me || echo 000)
if [ "$w" = "000" ]; then echo "$(ts) web :4200 unreachable — restarting" >> "$LOG"; pm2 restart $WEB_APP >> "$LOG" 2>&1; fi
if [ "$a" = "000" ]; then echo "$(ts) api :4100 unreachable — restarting" >> "$LOG"; pm2 restart freshrice-api-prod >> "$LOG" 2>&1; fi
exit 0
