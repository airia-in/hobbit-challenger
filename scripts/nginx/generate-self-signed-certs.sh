#!/usr/bin/env bash
# Generate dev/initial TLS material for the nginx compose service.
# Replace these files with Let's Encrypt (or another CA) certs in production.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CERT_DIR="${ROOT_DIR}/nginx/certs"
FULLCHAIN="${CERT_DIR}/fullchain.pem"
PRIVKEY="${CERT_DIR}/privkey.pem"

mkdir -p "${CERT_DIR}"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${PRIVKEY}" \
  -out "${FULLCHAIN}" \
  -subj '/CN=hobbit.drcode.ai' \
  -addext 'subjectAltName=DNS:hobbit.drcode.ai,DNS:hobbit-api.drcode.ai'

chmod 600 "${PRIVKEY}"
echo "Wrote ${FULLCHAIN} and ${PRIVKEY}"
