sudo -n true 2>&1 | head -1; echo "rc=${PIPESTATUS[0]}"
