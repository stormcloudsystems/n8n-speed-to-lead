#!/bin/sh
# Real-runtime integration test: imports workflow/speed-to-lead.json into a clean stock n8n 2.43.4, points its SMTP
# credential at a local Mailpit capture server, publishes it, calls the real webhook and checks the captured mail.
# Needs: Docker Engine with Compose v2, Node.js >= 22. Ports (127.0.0.1): F2_N8N_PORT=15678, F2_MAIL_PORT=18025.
# Creates and then deletes a throw-away compose project; no real e-mail is sent.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export COMPOSE_FILE="$HERE/compose.yml" COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-f2-speed-to-lead-test}"
export F2_N8N_PORT="${F2_N8N_PORT:-15678}" F2_MAIL_PORT="${F2_MAIL_PORT:-18025}"
F2_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"); export F2_ENCRYPTION_KEY
say() { echo "== $(date -u +%H:%M:%S) $*"; }
cleanup() { [ "${KEEP:-0}" = 1 ] || docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

say "versions: $(docker --version) | compose $(docker compose version --short) | node $(node -v)"
docker compose down -v >/dev/null 2>&1 || true
docker compose up -d mail >/dev/null
say "import SMTP credential (host from container env; Mailpit needs no password) and the workflow"
docker compose run --rm -T --no-deps --entrypoint sh n8n -c '
  umask 077
  node -e "console.log(JSON.stringify([{ id: \"speedToLeadSmtp1\", name: \"SMTP account\", type: \"smtp\",
    data: { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: false, user: \"\", password: \"\", disableStartTls: true } }]))" > /tmp/c.json
  n8n import:credentials --input=/tmp/c.json; s=$?; rm -f /tmp/c.json; [ $s = 0 ] || exit $s
  n8n import:workflow --input=/workflow/speed-to-lead.json && n8n publish:workflow --id=SpeedToLeadFree1
  n8n --version' 2>&1 | grep -E "Successfully|ublish|^[0-9]+\.[0-9]+\.[0-9]+$|rror" || true
docker compose up -d n8n >/dev/null
say "waiting for n8n and the published webhook"
i=0
until c=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "content-type: application/json" -d "{}" "http://127.0.0.1:$F2_N8N_PORT/webhook/speed-to-lead") && [ "$c" != 404 ] && [ "$c" != 000 ]; do
  i=$((i+1)); [ $i -gt 120 ] && { docker compose logs n8n | tail -n 30; echo "n8n webhook not ready" >&2; exit 1; }; sleep 1
done
say "webhook ready after ~${i}s; running tests"
N8N_URL="http://127.0.0.1:$F2_N8N_PORT" MAILPIT_URL="http://127.0.0.1:$F2_MAIL_PORT" node --test --test-concurrency=1 "$HERE"/*.test.mjs
