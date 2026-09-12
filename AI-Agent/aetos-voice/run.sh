#!/usr/bin/env bash
# Start the dashboard (reads .env for host/port/credentials)
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/python -m app
