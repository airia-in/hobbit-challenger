#!/usr/bin/env bash
# Generate dev/initial TLS material for the nginx compose service.
# Replace these files with Let's Encrypt (or another CA) certs in production.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CERT_DIR="${ROOT_DIR}/nginx/certs"
FULLCHAIN="${CERT_DIR}/fullchain.pem"
PRIVKEY="${CERT_DIR}/privkey.pem"

WEB_DOMAIN="${WEB_DOMAIN:-hobbit.drcode.ai}"
API_DOMAIN="${API_DOMAIN:-hobbit-api.drcode.ai}"

mkdir -p "${CERT_DIR}"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${PRIVKEY}" \
  -out "${FULLCHAIN}" \
  -subj "/CN=${WEB_DOMAIN}" \
  -addext "subjectAltName=DNS:${WEB_DOMAIN},DNS:${API_DOMAIN}"

chmod 600 "${PRIVKEY}"
echo "Wrote ${FULLCHAIN} and ${PRIVKEY} (SANs: ${WEB_DOMAIN}, ${API_DOMAIN})"
