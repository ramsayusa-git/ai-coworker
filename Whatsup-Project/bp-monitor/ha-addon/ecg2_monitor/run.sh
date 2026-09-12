#!/usr/bin/with-contenv bashio
# ECG2 Monitor add-on entrypoint: read options, resolve MQTT from the Supervisor, start the app.
set -e

export ECG_SOURCE="$(bashio::config 'source')"
export ECG_DEVICE_ADDRESS="$(bashio::config 'device_address')"
export ECG_DEVICE_NAME="$(bashio::config 'device_name')"
export ECG_SCAN_TIMEOUT="$(bashio::config 'scan_timeout')"
export ECG_MQTT_RAW_TOPIC="$(bashio::config 'mqtt_raw_topic')"
export ECG_DISCOVERY_PREFIX="$(bashio::config 'discovery_prefix')"
export ECG_MAINS_HZ="$(bashio::config 'mains_hz')"
export ECG_LOG_LEVEL="$(bashio::config 'log_level')"
export ECG_DATA_DIR="/share/ecg2"
export ECG_HTTP_PORT="8099"
export DBUS_SYSTEM_BUS_ADDRESS="unix:path=/run/dbus/system_bus_socket"

# MQTT: explicit options win, otherwise ask the Supervisor for the Mosquitto service.
if bashio::config.has_value 'mqtt_host'; then
    export ECG_MQTT_HOST="$(bashio::config 'mqtt_host')"
    export ECG_MQTT_PORT="$(bashio::config 'mqtt_port')"
    export ECG_MQTT_USER="$(bashio::config 'mqtt_user')"
    export ECG_MQTT_PASSWORD="$(bashio::config 'mqtt_password')"
elif bashio::services.available 'mqtt'; then
    export ECG_MQTT_HOST="$(bashio::services 'mqtt' 'host')"
    export ECG_MQTT_PORT="$(bashio::services 'mqtt' 'port')"
    export ECG_MQTT_USER="$(bashio::services 'mqtt' 'username')"
    export ECG_MQTT_PASSWORD="$(bashio::services 'mqtt' 'password')"
    bashio::log.info "MQTT resolved from Supervisor: ${ECG_MQTT_HOST}:${ECG_MQTT_PORT}"
else
    bashio::log.warning "No MQTT broker found — MQTT source and HA entities disabled"
fi

mkdir -p "${ECG_DATA_DIR}/sessions"
bashio::log.info "Starting ECG2 Monitor (source=${ECG_SOURCE}, device=${ECG_DEVICE_ADDRESS})"
exec python3 /app/main.py
