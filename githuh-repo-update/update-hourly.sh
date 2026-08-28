#!/bin/bash

# Hourly GitHub two-way sync: pull GitHub -> local, then commit & push local -> GitHub
# Also merges the 'master' branch (Windows machine sync) into 'main' so all
# machines converge on one branch. Exclusions live in .gitignore.

SCRIPT_DIR="/home/krishna/ai-work-space/ai-coworker/githuh-repo-update"
REPO_DIR="/home/krishna/ai-work-space/ai-coworker"
UPDATE_FILE="$REPO_DIR/hourly-update.txt"
LOG_FILE="$SCRIPT_DIR/hourly-update.log"
TOKEN_FILE="$HOME/.github-token"
GITHUB_USER="ramsayusa-git"
GITHUB_REPO="ai-coworker"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

# Read token from secure file
if [ ! -f "$TOKEN_FILE" ]; then
    log "ERROR: Token file not found at $TOKEN_FILE"
    exit 1
fi
GITHUB_TOKEN=$(cat "$TOKEN_FILE")

mkdir -p "$REPO_DIR" "$SCRIPT_DIR"
cd "$REPO_DIR" || exit 1

# Initialize git repo if not already initialized
if [ ! -d .git ]; then
    git init -b main
    git remote add origin "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
else
    git remote set-url origin "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
fi

git config user.email "ramsay.usa@gmail.com"
git config user.name "GitHub Automation"
git config core.safecrlf false

# Clean up leftovers from previously killed runs
if [ -f .git/index.lock ] && ! pgrep -x git >/dev/null 2>&1; then
    log "Removing stale index.lock"
    rm -f .git/index.lock
fi
rm -f .git/gc.log

log "Starting hourly sync..."

# 1) FETCH + PULL: bring all GitHub changes (all folders/files, new and updated) down
log "Fetching from GitHub..."
git fetch origin --prune 2>&1 | grep -v "^hint:" >> "$LOG_FILE" || true
log "Pulling latest main..."
git pull origin main --no-edit --allow-unrelated-histories 2>&1 | grep -v "^hint:" >> "$LOG_FILE" || true
if [ -n "$(git ls-files -u)" ]; then
    log "WARNING: pull produced conflicts - keeping local versions"
    git checkout --ours . 2>/dev/null
    git add -A . 2>/dev/null
    git commit --no-verify -m "Auto-resolve pull conflicts (kept local): $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE" 2>&1 || git merge --abort 2>/dev/null
fi

# Update timestamp file
{
    echo "Last updated: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Hostname: $(hostname)"
    echo "Uptime: $(uptime)"
} > "$UPDATE_FILE"

# Safety net: never stage files >95MB (GitHub rejects files over 100MB)
# or unreadable files/dirs (permission-denied aborts the whole git add)
{
    find . -path ./.git -prune -o -type f -size +95M -print 2>/dev/null
    find . -path ./.git -prune -o ! -readable -print 2>/dev/null
} | sed 's|^\./||' | grep -v '^\.$' | sort -u | while read -r f; do
    grep -qxF "$f" .git/info/exclude 2>/dev/null || { echo "$f" >> .git/info/exclude; log "Excluded (oversize/unreadable): $f"; }
done

# 2) STAGE + COMMIT all local changes, new folders and subfolders included
log "Staging changes..."
timeout 900 git add -A . 2>&1 | head -5 >> "$LOG_FILE"
if [ "${PIPESTATUS[0]}" = "124" ]; then
    log "WARNING: git add timed out after 900s - partial staging"
fi

if git diff --cached --quiet 2>/dev/null; then
    log "No new local changes to commit"
else
    git commit --no-verify -m "Hourly sync: $(date '+%Y-%m-%d %H:%M:%S')" 2>&1 | head -3 >> "$LOG_FILE"
    log "Local changes committed"
fi

# 3) MERGE the Windows 'master' branch into main (self-healing, runs until converged)
if git rev-parse --verify -q origin/master >/dev/null; then
    if git merge-base --is-ancestor origin/master HEAD 2>/dev/null; then
        log "master already merged into main"
    else
        log "Merging origin/master (Windows sync) into main..."
        if git merge origin/master --allow-unrelated-histories -X ours --no-edit \
             -m "Merge master (Windows sync) into main: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE" 2>&1; then
            log "master merged into main"
        else
            log "WARNING: master merge failed - aborting merge"
            git merge --abort 2>/dev/null
        fi
    fi
fi

# 4) PUSH main, and keep master pointed at the same content so Windows converges
log "Pushing to GitHub..."
if git push origin main --no-verify >> "$LOG_FILE" 2>&1; then
    log "Successfully pushed main"
    git push origin main:master --no-verify >> "$LOG_FILE" 2>&1 \
        && log "master updated to match main" \
        || log "Note: could not fast-forward master (will retry next run)"
else
    log "Push failed - see output above"
fi

echo "---" >> "$LOG_FILE"
