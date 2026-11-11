#!/usr/bin/env bash
# Deploys the backend to the Hetzner VPS (Docker + Caddy) and the frontend to Cloudflare Pages.
# Needs: podman, ssh access as `cineso-hetzner`, /opt/lohni/env on the VPS, wrangler logged in.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=cineso-hetzner
API=https://lohni-api.2-31-23-145.sslip.io

podman build -f backend/Dockerfile --target runtime -t lohni-backend:prod .
podman save localhost/lohni-backend:prod | gzip -1 | ssh "$HOST" 'gunzip | docker load'
ssh "$HOST" 'set -e
docker network create lohni >/dev/null 2>&1 || true
docker rm -f lohni-api >/dev/null 2>&1 || true
# Capped so a heavy import cannot starve the other services on this VPS.
docker run -d --name lohni-api --network lohni --restart unless-stopped --memory 768m --memory-swap 1g --cpus 1.5 --pids-limit 256 \
  --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp \
  -v /opt/lohni/storage:/app/storage --env-file /opt/lohni/env localhost/lohni-backend:prod
docker image prune -f >/dev/null'

(cd frontend && VITE_BACKEND_URL="$API" npm run build)
(cd frontend && ../deploy/cloudflare/node_modules/.bin/wrangler pages deploy dist --project-name lohni --branch main --commit-dirty=true)
