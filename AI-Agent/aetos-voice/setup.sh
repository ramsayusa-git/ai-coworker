#!/usr/bin/env bash
# One-time local setup: venv + dependencies + .env
set -euo pipefail
cd "$(dirname "$0")"

# Recreate the venv if it's missing or broken (no pip = python3-venv not installed)
if [ ! -x .venv/bin/pip ]; then
  rm -rf .venv
  python3 -m venv .venv || true
  if [ ! -x .venv/bin/pip ]; then
    rm -rf .venv
    echo ""
    echo "ERROR: Python venv support is incomplete — the venv was created without pip."
    echo "Fix (Ubuntu/Debian):  sudo apt install -y python3-venv python3-pip"
    echo "Then run this again:  bash setup.sh"
    exit 1
  fi
fi

.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -e ".[dev,worker]"

if [ ! -f .env ]; then
  cp .env.example .env
  SECRET=$(.venv/bin/python -c "import secrets; print(secrets.token_urlsafe(48))")
  sed -i "s|^APP_SECRET_KEY=.*|APP_SECRET_KEY=${SECRET}|" .env
  echo ""
  echo ".env created with a generated APP_SECRET_KEY."
  echo "Edit .env to set APP_ADMIN_PASSWORD (currently 'admin')."
fi

echo ""
echo "Setup done. Start the dashboard with:  bash run.sh"
echo "Run the test suite with:              .venv/bin/pytest"
