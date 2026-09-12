#!/usr/bin/with-contenv bashio
# BP Monitor add-on entrypoint: read options, resolve MQTT from the Supervisor, start the app.
set -e

export BP_SOURCE="$(bashio::config 'source')"
export BP_DEVICE_ADDRESS="$(bashio::config 'device_address')"
export BP_DEVICE_NAME="$(bashio::config 'device_name')"
export BP_SCAN_TIMEOUT="$(bashio::config 'scan_timeout')"
export BP_MQTT_RAW_TOPIC="$(bashio::config 'mqtt_raw_topic')"
export BP_DISCOVERY_PREFIX="$(bashio::config 'discovery_prefix')"
export BP_LOG_LEVEL="$(bashio::config 'log_level')"
export BP_DATA_DIR="/share/bp_monitor"
export BP_HTTP_PORT="8100"
export DBUS_SYSTEM_BUS_ADDRESS="unix:path=/run/dbus/system_bus_socket"

# MQTT: explicit options win, otherwise ask the Supervisor for the Mosquitto service.
if bashio::config.has_value 'mqtt_host'; then
    export BP_MQTT_HOST="$(bashio::config 'mqtt_host')"
    export BP_MQTT_PORT="$(bashio::config 'mqtt_port')"
    export BP_MQTT_USER="$(bashio::config 'mqtt_user')"
    export BP_MQTT_PASSWORD="$(bashio::config 'mqtt_password')"
elif bashio::services.available 'mqtt'; then
    export BP_MQTT_HOST="$(bashio::services 'mqtt' 'host')"
    export BP_MQTT_PORT="$(bashio::services 'mqtt' 'port')"
    export BP_MQTT_USER="$(bashio::services 'mqtt' 'username')"
    export BP_MQTT_PASSWORD="$(bashio::services 'mqtt' 'password')"
    bashio::log.info "MQTT resolved from Supervisor: ${BP_MQTT_HOST}:${BP_MQTT_PORT}"
else
    bashio::log.warning "No MQTT broker found — MQTT source and HA entities disabled"
fi

mkdir -p "${BP_DATA_DIR}"
bashio::log.info "Starting BP Monitor (source=${BP_SOURCE}, device=${BP_DEVICE_ADDRESS})"
exec python3 /app/main.py
