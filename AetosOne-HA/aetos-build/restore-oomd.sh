#!/bin/bash
sudo systemctl unmask systemd-oomd.service systemd-oomd.socket 2>&1 | tail -1
sudo systemctl start systemd-oomd.service 2>/dev/null && echo oomd-restarted || true
