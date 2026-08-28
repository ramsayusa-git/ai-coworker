#!/bin/sh
set -e

# Make sure we can talk to the Docker daemon
echo "Waiting for Docker daemon..."
while ! docker version 2> /dev/null > /dev/null; do
	sleep 1
done

# Install Supervisor, plug-ins, branded Core (largest first - docker load needs space)
echo "Loading container images..."
# shellcheck disable=SC2045
for image in $(ls -S /build/images/*.tar); do
	docker load --input "${image}"
done

# Tag the Supervisor how the OS expects it to be tagged
supervisor=$(docker images --filter "label=io.hass.type=supervisor" --quiet)
arch=$(docker inspect --format '{{ index .Config.Labels "io.hass.arch" }}' "${supervisor}")
docker tag "${supervisor}" "ghcr.io/home-assistant/${arch}-hassio-supervisor:latest"

# AETOS ONE v9.8.8: pre-warm REMOVED (smaller ~1GB image; Core unpacks on first boot).
echo "Container images loaded (pre-warm disabled)."
