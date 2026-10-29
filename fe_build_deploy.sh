#!/bin/bash
# fe_build_deploy.sh — canonical frontend build+deploy for Vulnerix.
# ALWAYS passes the required VITE build args (missing them => blank app:
# "supabaseUrl is required"). Reads values from .env so they're never hardcoded.
set -e
cd /home/avotrix/Vulnerix

VITE_URL=$(grep -E '^VITE_SUPABASE_URL=' .env | tail -1 | cut -d= -f2- | tr -d '"')
VITE_KEY=$(grep -E '^VITE_SUPABASE_PUBLISHABLE_KEY=' .env | tail -1 | cut -d= -f2- | tr -d '"')

if [ -z "$VITE_URL" ] || [ -z "$VITE_KEY" ]; then
  echo "ERROR: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing from .env"; exit 1
fi

echo "Building vulnerix-frontend:latest with VITE_SUPABASE_URL=$VITE_URL (key len ${#VITE_KEY})"
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_URL" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_KEY" \
  -t vulnerix-frontend:latest . 2>&1 | tail -6

# Verify the URL is embedded before deploying (guards against blank-app regressions).
CID=$(docker create vulnerix-frontend:latest)
TMP="/tmp/fe_verify_$$"; mkdir -p "$TMP"
docker cp "$CID":/usr/share/nginx/html/assets/ "$TMP"/ >/dev/null 2>&1 || true
docker rm "$CID" >/dev/null 2>&1 || true
BUNDLE=$(ls "$TMP"/assets/index-*.js 2>/dev/null | head -1)
if [ -z "$BUNDLE" ] || ! grep -q "$VITE_URL" "$BUNDLE"; then
  echo "ABORT: supabase URL not embedded in bundle — not deploying."; rm -rf "$TMP"; exit 1
fi
rm -rf "$TMP"
echo "[OK] supabase URL embedded."

# Swap the running container.
docker stop vulnerix-frontend 2>/dev/null || true
docker rm vulnerix-frontend 2>/dev/null || true
docker run -d --name vulnerix-frontend --restart unless-stopped -p 8080:80 vulnerix-frontend:latest
sleep 2
echo "=== status ==="; docker ps --filter name=vulnerix-frontend --format '{{.Image}} {{.Status}} {{.Ports}}'
echo "=== serve ==="; curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8080/
