#!/bin/bash

# Hourly GitHub commit script
# Updates a file and commits to GitHub every hour

SCRIPT_DIR="/home/krishna/ai-work-space/ai-coworker/githuh-repo-update"
REPO_DIR="/home/krishna/ai-work-space/ai-coworker"
UPDATE_FILE="$REPO_DIR/hourly-update.txt"
LOG_FILE="$SCRIPT_DIR/hourly-update.log"
GITHUB_TOKEN="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"
GITHUB_USER="ramsayusa-git"
GITHUB_REPO="ai-coworker"

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
    # Update remote URL to use token if it doesn't already
    git remote set-url origin "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
fi

# Configure git user if not already set
git config user.email "ramsay.usa@gmail.com" || true
git config user.name "GitHub Automation" || true

# Log the update
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting hourly update..." >> "$LOG_FILE"

# Pull latest changes from GitHub first
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling latest changes..." >> "$LOG_FILE"
git pull origin main --allow-unrelated-histories >> "$LOG_FILE" 2>&1

if [ $? -ne 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠ Pull had issues (may be first run)" >> "$LOG_FILE"
fi

# Update the file with current timestamp
echo "Last updated: $(date '+%Y-%m-%d %H:%M:%S')" > "$UPDATE_FILE"
echo "Hostname: $(hostname)" >> "$UPDATE_FILE"
echo "Uptime: $(uptime)" >> "$UPDATE_FILE"

# Stage all changes in the repository
git add -A
git commit -m "Hourly sync: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Changes committed" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No changes to commit or commit failed" >> "$LOG_FILE"
fi

# Push to GitHub
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushing to GitHub..." >> "$LOG_FILE"
git push origin main >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✓ Successfully pushed to GitHub" >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✗ Error during push" >> "$LOG_FILE"
fi

echo "---" >> "$LOG_FILE"
