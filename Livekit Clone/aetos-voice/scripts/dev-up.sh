#!/usr/bin/env bash
# Local (no-docker) bring-up: one venv per component, unix sockets under ~/.aetos/run if /run/aetos is not writable.
set -euo pipefail
cd "$(dirname "$0")/.."
export AETOS_ROOT="$PWD" AETOS_STATE="${AETOS_STATE:-$HOME/.aetos}" AETOS_RUN="${AETOS_RUN:-$HOME/.aetos/run}"
mkdir -p "$AETOS_STATE" "$AETOS_RUN"
python3 -m venv "$AETOS_STATE/venvs/aetosd" 2>/dev/null || true
"$AETOS_STATE/venvs/aetosd/bin/pip" install -q -r aetosd/requirements.txt
PY="$AETOS_STATE/venvs/aetosd/bin/python"
pgrep -f "aetosd serve" >/dev/null || (nohup env PYTHONPATH="$PWD" $PY -m aetosd serve > "$AETOS_STATE/aetosd.log" 2>&1 &)
sleep 1
PYTHONPATH="$PWD" $PY -m aetosd up ${@:-tts-mock stt-mock aetos-core}
PYTHONPATH="$PWD" $PY -m aetosd ls
