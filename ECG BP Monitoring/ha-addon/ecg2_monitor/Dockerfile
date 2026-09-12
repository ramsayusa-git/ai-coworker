ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-python:3.12-alpine3.20
FROM ${BUILD_FROM}

# bleak talks to the host's bluetoothd over D-Bus (host_dbus: true) — no BlueZ
# userland is needed inside the container. All deps ship musllinux wheels.
RUN pip3 install --no-cache-dir \
      "bleak>=0.22,<1.0" \
      "aiohttp>=3.9,<4" \
      "paho-mqtt>=2.0,<3"

WORKDIR /app
COPY app/ /app/
COPY run.sh /run.sh
RUN chmod a+x /run.sh

ENV PYTHONUNBUFFERED=1
CMD ["/run.sh"]
