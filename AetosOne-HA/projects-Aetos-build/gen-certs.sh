#!/bin/bash
# Generate Aetos One Root CA + aetosone.local server cert (private CA).
set -e
OUT=/home/krishna/projects/Aetos-build/aetos-certs
mkdir -p "$OUT"
sudo -n podman run --rm -v "$OUT":/out docker.io/library/alpine:latest sh -c '
  apk add --no-cache openssl >/dev/null 2>&1
  cd /out
  # --- Root CA (keep ca.key OFF the image; distribute ca.crt to clients) ---
  openssl genrsa -out ca.key 4096 2>/dev/null
  openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out aetos-ca.crt \
    -subj "/O=Aetos TechLabs/CN=Aetos One Root CA" 2>/dev/null
  # --- Server cert for aetosone.local ---
  openssl genrsa -out aetosone.key 2048 2>/dev/null
  openssl req -new -key aetosone.key -out aetosone.csr \
    -subj "/O=Aetos One/CN=aetosone.local" 2>/dev/null
  cat > san.cnf <<EOF
subjectAltName=DNS:aetosone.local,DNS:*.aetosone.local
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
EOF
  openssl x509 -req -in aetosone.csr -CA aetos-ca.crt -CAkey ca.key -CAcreateserial \
    -out aetosone.crt -days 825 -sha256 -extfile san.cnf 2>/dev/null
  cat aetosone.crt aetos-ca.crt > fullchain.crt
  rm -f aetosone.csr san.cnf aetos-ca.srl
  chmod 644 *.crt; chmod 640 *.key
  echo "=== generated ==="; ls -l /out
  echo "=== server cert SAN ==="; openssl x509 -in aetosone.crt -noout -text | grep -A1 "Subject Alternative"
'
