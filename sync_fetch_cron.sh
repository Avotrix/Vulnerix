#!/bin/bash
# sync_fetch_cron.sh — reads admin_settings (nvdFetchTime, certInFetchTime in IST)
# from the DB and rewrites the two daily fetch cron lines in root's crontab.
# Converts IST -> UTC (crontab runs in UTC). Idempotent: only rewrites if changed.
# Lightweight: one psql read + crontab edit. No heavy processing.

set -e
PROJECT_DIR="/home/avotrix/Vulnerix"

# Pull the two times from admin_settings JSON. Fallback to current defaults.
ROW=$(docker exec supabase-db psql -U postgres -d postgres -A -t -c \
  "SELECT COALESCE(settings->>'nvdFetchTime','20:35') || '|' || COALESCE(settings->>'certInFetchTime','19:35') FROM public.admin_settings LIMIT 1;" 2>/dev/null | tr -d '[:space:]')

if [ -z "$ROW" ]; then
  echo "$(date) sync_fetch_cron: no admin_settings row, skipping"
  exit 0
fi

NVD_IST="${ROW%%|*}"
CERT_IST="${ROW##*|}"

# Convert an IST HH:MM to a UTC "MIN HOUR" cron pair (IST = UTC + 5:30).
ist_to_utc_cron() {
  local hhmm="$1"
  local h="${hhmm%%:*}"
  local m="${hhmm##*:}"
  h=$((10#$h)); m=$((10#$m))
  # subtract 5h30m
  local total=$(( h*60 + m - (5*60+30) ))
  # wrap into 0..1439
  while [ $total -lt 0 ]; do total=$((total+1440)); done
  total=$((total % 1440))
  local uh=$(( total / 60 ))
  local um=$(( total % 60 ))
  echo "$um $uh"
}

NVD_CRON=$(ist_to_utc_cron "$NVD_IST")
CERT_CRON=$(ist_to_utc_cron "$CERT_IST")

# Build the desired crontab: keep all non-fetch lines, replace the two fetch lines.
CURRENT=$(crontab -l 2>/dev/null || true)
FILTERED=$(printf "%s\n" "$CURRENT" | grep -v "daily_nvd_extract.py" | grep -v "daily_cert_extract.py" | grep -v "^# Daily NVD" | grep -v "^# Daily CERT")

NEW=$(cat <<EOF
$FILTERED
# Daily CERT-IN update (IST $CERT_IST)
$CERT_CRON * * * cd $PROJECT_DIR && python3 daily_cert_extract.py >> cron_cert.log 2>&1
# Daily NVD incremental update (IST $NVD_IST)
$NVD_CRON * * * cd $PROJECT_DIR && python3 daily_nvd_extract.py >> cron_nvd_daily.log 2>&1
EOF
)

# Only update if changed.
if [ "$CURRENT" != "$NEW" ]; then
  printf "%s\n" "$NEW" | crontab -
  echo "$(date) sync_fetch_cron: crontab updated (NVD $NVD_IST IST=$NVD_CRON UTC, CERT $CERT_IST IST=$CERT_CRON UTC)"
else
  echo "$(date) sync_fetch_cron: no change"
fi
