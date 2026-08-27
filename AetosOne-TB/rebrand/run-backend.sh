#!/usr/bin/env bash
# Start the Aetos One Cloud (ThingsBoard) backend on http://localhost:8080
set -euo pipefail

TB="/run/media/krishna/data-backup/claude-cowork/AetosOne-TB/thingsboard"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
BOOT_JAR=$(ls "$TB"/application/target/thingsboard-*-boot.jar | head -1)

exec "$JAVA_HOME/bin/java" -Xms1g -Xmx3g \
  -Dinstall.data_dir="$TB/application/target/data" \
  -jar "$BOOT_JAR" \
  --spring.datasource.url=jdbc:postgresql://localhost:5432/thingsboard \
  --spring.datasource.username=postgres \
  --spring.datasource.password=postgres \
  --server.port=8080 \
  --logging.config="$TB/application/src/main/resources/logback.xml"
