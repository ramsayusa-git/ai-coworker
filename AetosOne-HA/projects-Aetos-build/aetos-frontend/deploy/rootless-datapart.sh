#!/bin/sh
# Runs INSIDE a privileged docker:dind container (uid 0). Loads HAOS container
# image tars with the containerd snapshotter and packs a hassos-data.ext4 WITHOUT
# any loop-mount or sudo — the rootless-friendly replacement for create-data-partition.sh.
# Mounts expected: /build/images (tars, ro), /out (output), this script.
set -e
apk add --no-cache e2fsprogs curl jq >/dev/null 2>&1 || true

mkdir -p /data/docker
dockerd --host=unix:///var/run/docker.sock --feature containerd-snapshotter \
  --iptables=false --ip6tables=false --data-root /data/docker >/var/log/dockerd.log 2>&1 &
for i in $(seq 1 40); do docker version >/dev/null 2>&1 && break; sleep 2; done
docker version >/dev/null 2>&1 || { echo "DOCKERD FAILED"; tail -30 /var/log/dockerd.log; exit 1; }

echo "== loading image tars (largest first) =="
for img in $(ls -S /build/images/*.tar); do
  echo "  load $(basename "$img")"
  docker load --input "$img" >/dev/null
done

# Tag supervisor as HAOS expects
sup=$(docker images --filter "label=io.hass.type=supervisor" --quiet | head -1)
arch=$(docker inspect --format '{{ index .Config.Labels "io.hass.arch" }}' "$sup")
docker tag "$sup" "ghcr.io/home-assistant/${arch}-hassio-supervisor:latest"
echo "== images loaded =="; docker images --format '{{.Repository}}:{{.Tag}}'

# Supervisor apparmor + updater channel + snapshotter marker
mkdir -p /data/supervisor/apparmor
curl -fsL -o /data/supervisor/apparmor/hassio-supervisor \
  "https://version.home-assistant.io/apparmor_${CHANNEL:-stable}.txt" || echo "apparmor dl failed (non-fatal)"
printf '{"channel": "%s"}' "${CHANNEL:-stable}" > /data/supervisor/updater.json
touch /data/.docker-use-containerd-snapshotter

# Stop dockerd so the storage is quiesced before packing
kill %1 2>/dev/null || pkill dockerd || true
sleep 5

echo "== packing data.ext4 (mke2fs -d, no mount) =="
rm -f /out/data.ext4
truncate -s 2560M /out/data.ext4
mke2fs -q -F -t ext4 -L "hassos-data" -d /data \
  -E lazy_itable_init=0,lazy_journal_init=0 /out/data.ext4
e2fsck -fy /out/data.ext4 || true
resize2fs -M /out/data.ext4
echo "== done: $(ls -lh /out/data.ext4) =="
