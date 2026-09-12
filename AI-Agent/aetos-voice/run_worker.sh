#!/usr/bin/env bash
# Start the agent worker (needs OPENAI_API_KEY in .env; deps: setup.sh installs [worker] extra)
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/python scripts/run_agents.py dev
