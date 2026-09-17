#!/bin/bash
# AOC-AetosOneCore — promote the current dev state to the production repo.
# Manual only. Usage:  ./aoc-promote-to-prod.sh  [tag]      e.g. ./aoc-promote-to-prod.sh v0.3.0

set -e
REPO="/home/krishna/ai-work-space/repos/AOC-AetosOneCore"
LOG="/home/krishna/ai-work-space/ai-coworker/githuh-repo-update/aoc-daily-dev.log"
TOKEN=$(cat "$HOME/.github-token")
GH_USER="ramsayusa-git"
PROD_REPO="AOC-AetosOneCore"
TAG="${1:-rel-$(date '+%Y.%m.%d-%H%M')}"

cd "$REPO"

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Working tree is dirty. Run aoc-daily-dev.sh first, or commit manually."
    exit 1
fi

git remote remove prod 2>/dev/null || true
git remote add prod "https://${GH_USER}:${TOKEN}@github.com/${GH_USER}/${PROD_REPO}.git"

echo "Promoting $(git rev-parse --short HEAD) to ${PROD_REPO} as ${TAG}"
git tag -f "$TAG" -m "Production release ${TAG}"
git push prod main --no-verify
git push prod "$TAG" --no-verify --force

git remote set-url prod "https://github.com/${GH_USER}/${PROD_REPO}.git"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Promoted ${TAG} to ${PROD_REPO}" >> "$LOG"
echo "Done. https://github.com/${GH_USER}/${PROD_REPO}/releases/tag/${TAG}"
