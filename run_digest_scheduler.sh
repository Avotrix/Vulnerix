#!/bin/bash
# run_digest_scheduler.sh — hourly cron that triggers the scheduled email digest.
# Calls the send-notifications edge function with {"trigger":"scheduled"} using
# the service role key as the bearer token (server-to-server auth). The function
# then decides, per user, whether their daily/weekly IST time is due.
#
# Lightweight: one curl. No heavy work here — the function does per-user checks
# and only builds/sends email for users actually due this hour.

# Read the service role key from the running edge container's env (never stored
# in this file, so the secret isn't exposed on disk).
SRK=$(docker exec supabase-edge-functions sh -c 'printf %s "$SUPABASE_SERVICE_ROLE_KEY"' 2>/dev/null)
if [ -z "$SRK" ]; then
  echo "$(date) digest_scheduler: could not read service role key, aborting"
  exit 1
fi

# Kong gateway is published on the host at :8000.
URL="http://localhost:8000/functions/v1/send-notifications"

RESP=$(curl -s -m 60 -X POST "$URL" \
  -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  -d '{"trigger":"scheduled"}')

echo "$(date) digest_scheduler: $RESP"
