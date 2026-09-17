#!/bin/bash
# AOC-AetosOneCore — daily mirror of the authoring folder into the dev repo.
# Runs from cron at 23:45 IST. One-way: authoring folder -> working clone -> GitHub dev.
# Production is NEVER touched here; use aoc-promote-to-prod.sh for that.

SRC="/home/krishna/ai-work-space/ai-coworker/Aetos One Care"
REPO="/home/krishna/ai-work-space/repos/AOC-AetosOneCore"
LOG="/home/krishna/ai-work-space/ai-coworker/githuh-repo-update/aoc-daily-dev.log"
TOKEN_FILE="$HOME/.github-token"
GH_USER="ramsayusa-git"
DEV_REPO="AOC-AetosOneCore-dev"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

[ -f "$TOKEN_FILE" ] || { log "ERROR: $TOKEN_FILE missing"; exit 1; }
TOKEN=$(cat "$TOKEN_FILE")
[ -d "$SRC" ] || { log "ERROR: source folder missing: $SRC"; exit 1; }

cd "$REPO" || exit 1

if [ ! -d .git ]; then
    git init -b main >> "$LOG" 2>&1
fi
git config user.name  "Aetos Automation"
git config user.email "ramsay.usa@gmail.com"
git config pull.rebase false
git remote remove dev 2>/dev/null
git remote add dev "https://${GH_USER}:${TOKEN}@github.com/${GH_USER}/${DEV_REPO}.git"

[ -f .git/index.lock ] && ! pgrep -x git >/dev/null 2>&1 && rm -f .git/index.lock

log "Mirroring authoring folder..."
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.gitignore' \
  --exclude 'README.md' \
  --exclude '__pycache__/' \
  --exclude 'node_modules/' \
  --exclude '*.bak-*' \
  --exclude '*.log' \
  --exclude '.env' \
  "$SRC/" "$REPO/" >> "$LOG" 2>&1 || { log "ERROR: rsync failed"; exit 1; }

# never stage anything GitHub will reject
find . -path ./.git -prune -o -type f -size +95M -print 2>/dev/null | sed 's|^\./||' | while read -r f; do
    grep -qxF "$f" .git/info/exclude 2>/dev/null || { echo "$f" >> .git/info/exclude; log "Excluded (>95MB): $f"; }
done

git add -A . >> "$LOG" 2>&1
if git diff --cached --quiet 2>/dev/null; then
    log "No changes today"
else
    FILES=$(git diff --cached --name-only | wc -l)
    git commit --no-verify -m "Daily dev sync: $(date '+%Y-%m-%d') (${FILES} files)" >> "$LOG" 2>&1
    log "Committed ${FILES} changed files"
fi

if git push dev main --no-verify >> "$LOG" 2>&1; then
    log "Pushed to ${DEV_REPO}"
else
    log "ERROR: push to ${DEV_REPO} failed"
fi

# scrub the token back out of the stored remote
git remote set-url dev "https://github.com/${GH_USER}/${DEV_REPO}.git"
echo "---" >> "$LOG"
