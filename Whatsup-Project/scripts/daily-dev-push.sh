#!/usr/bin/env bash
# Daily commit + push of Loqio's working tree to the `dev` branch.
#
# Deliberately only ever touches `dev` — `main` is promoted by pull request, so an
# automated job can never move production.
#
# Credentials: reads GITHUB_TOKEN from ~/.config/loqio/git-credentials (mode 600).
# The token is never written into .git/config, so `git remote -v` stays clean.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/ai-work-space/ai-coworker/Whatsup-Project}"
CRED_FILE="${CRED_FILE:-$HOME/.config/loqio/git-credentials}"
LOG="${LOG:-$HOME/.local/state/loqio-daily-push.log}"
mkdir -p "$(dirname "$LOG")"

say() { printf '%s %s\n' "$(date -Is)" "$*" | tee -a "$LOG"; }

cd "$REPO_DIR"

if [[ ! -r "$CRED_FILE" ]]; then
  say "ERROR: no credential file at $CRED_FILE — cannot push."
  exit 1
fi
# shellcheck disable=SC1090
source "$CRED_FILE"   # defines GITHUB_USER and GITHUB_TOKEN
: "${GITHUB_USER:?missing GITHUB_USER}" "${GITHUB_TOKEN:?missing GITHUB_TOKEN}"

# Always land on dev. If the tree is detached, stop rather than guessing — a daily job
# should never improvise with someone's uncommitted work.
if ! git symbolic-ref -q HEAD >/dev/null; then
  say "ERROR: detached HEAD — skipping."
  exit 1
fi
git checkout -q dev 2>/dev/null || { say "ERROR: cannot check out dev — skipping."; exit 1; }

if [[ -z "$(git status --porcelain)" ]]; then
  say "No changes. Nothing to push."
  exit 0
fi

# Refuse to commit anything that looks like a real secret, even though .gitignore should
# already exclude it. An unattended daily job is exactly where a leak goes unnoticed.
git add -A
if git diff --cached --name-only | grep -qE '(^|/)\.env($|\.)'; then
  say "ERROR: a .env file is staged — aborting and unstaging."
  git reset -q
  exit 1
fi

FILES=$(git diff --cached --name-only | wc -l)
git -c user.email="ramsay.usa@gmail.com" -c user.name="Ramsay" \
    commit -q -m "Daily sync: $(date +%Y-%m-%d) ($FILES files)"

git -c credential.helper='!f(){ echo "username='"$GITHUB_USER"'"; echo "password='"$GITHUB_TOKEN"'"; };f' \
    push -q origin dev

say "Pushed $FILES file(s) to dev: $(git rev-parse --short HEAD)"
