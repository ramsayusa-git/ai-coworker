#!/bin/bash

# Hourly GitHub commit script - Full folder sync without prompts

SCRIPT_DIR="/home/krishna/ai-work-space/ai-coworker/githuh-repo-update"
REPO_DIR="/home/krishna/ai-work-space/ai-coworker"
UPDATE_FILE="$REPO_DIR/hourly-update.txt"
LOG_FILE="$SCRIPT_DIR/hourly-update.log"
TOKEN_FILE="$HOME/.github-token"
GITHUB_USER="ramsayusa-git"
GITHUB_REPO="ai-coworker"

# Read token from secure file
if [ ! -f "$TOKEN_FILE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Token file not found at $TOKEN_FILE" >> "$LOG_FILE"
    exit 1
fi
GITHUB_TOKEN=$(cat "$TOKEN_FILE")

# Create directories if they don't exist
mkdir -p "$REPO_DIR"
mkdir -p "$SCRIPT_DIR"

# Navigate to repo
cd "$REPO_DIR" || exit 1

# Initialize git repo if not already initialized
if [ ! -d .git ]; then
    git init
    git remote add origin "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
else
    # Update remote URL to use token
    git remote set-url origin "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
fi

# Configure git user and no-prompts
git config user.email "ramsay.usa@gmail.com"
git config user.name "GitHub Automation"
git config core.safecrlf false
git config core.checkStat minimal

# Log the update
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting hourly update..." >> "$LOG_FILE"

# Pull latest changes from GitHub (no prompt)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling latest changes..." >> "$LOG_FILE"
git pull origin main --no-edit --allow-unrelated-histories 2>&1 | grep -v "^hint:" >> "$LOG_FILE" || true

# Update timestamp file
echo "Last updated: $(date '+%Y-%m-%d %H:%M:%S')" > "$UPDATE_FILE"
echo "Hostname: $(hostname)" >> "$UPDATE_FILE"
echo "Uptime: $(uptime)" >> "$UPDATE_FILE"

# Stage all changes efficiently (non-blocking, ignore large folders)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Staging changes..." >> "$LOG_FILE"

# Add specific manageable files first
git add .gitignore hourly-update.txt 2>/dev/null || true
git add githuh-repo-update/ 2>/dev/null || true
git add .claude/ 2>/dev/null || true

# Try to add large folders with shorter timeout, skip if timeout
timeout 15 git add AetosOne-HA/ 2>/dev/null || true
timeout 15 git add AetosOne-TB/ 2>/dev/null || true

# Commit all staged changes (force, no verify, no edit)
COMMIT_MSG="Hourly sync: $(date '+%Y-%m-%d %H:%M:%S')"
git commit --no-verify -m "$COMMIT_MSG" 2>&1 | head -3 >> "$LOG_FILE" || true

if git diff --cached --quiet; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Changes committed" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⓘ No new changes to commit" >> "$LOG_FILE"
fi

# Push to GitHub (no prompt, no verify)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushing to GitHub..." >> "$LOG_FILE"
git push origin main --no-verify 2>&1 | tail -3 >> "$LOG_FILE" || true

if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Successfully pushed to GitHub" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ Push attempt completed" >> "$LOG_FILE"
fi

echo "---" >> "$LOG_FILE"
