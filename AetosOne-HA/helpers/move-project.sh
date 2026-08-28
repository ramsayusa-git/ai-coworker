#!/bin/bash
DEST=/run/media/krishna/data-backup/claude-cowork
echo "=== move start $(date +%T) ==="
rsync -a --delete /home/krishna/projects/Aetos-build/ "$DEST/projects-Aetos-build/"
echo "=== projects done $(date +%T) ==="
rsync -a --delete /home/krishna/aetos-build/ "$DEST/aetos-build/"
echo "=== aetos-build done $(date +%T) ==="
echo "src aetos-build: $(du -sm /home/krishna/aetos-build | cut -f1)M  dest: $(du -sm $DEST/aetos-build | cut -f1)M"
echo "src projects: $(du -sm /home/krishna/projects/Aetos-build | cut -f1)M  dest: $(du -sm $DEST/projects-Aetos-build | cut -f1)M"
echo "=== RSYNC COMPLETE $(date +%T) ==="
