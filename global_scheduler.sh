#!/bin/bash
# global_scheduler.sh â€” runs every 5 minutes (single cron line). Jobs:
#   1) Digest: triggers send-notifications (trigger=scheduled) -> emails due users.
#   2) Per-user REFRESH: re-match each user's tech stack via cve-engine on a
#      schedule. Priority: user's own interval ELSE admin engineSchedule.
#   3) Fetch-schedule apply + SOURCE GATING + per-source FREQUENCY (6h/12h/daily/weekly).
PROJECT_DIR="/home/avotrix/Vulnerix"
BASE_URL="http://localhost:8000"

SRK=$(docker exec supabase-edge-functions sh -c 'printf %s "$SUPABASE_SERVICE_ROLE_KEY"' 2>/dev/null)

# â”€â”€ Job 1: digest trigger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if [ -n "$SRK" ]; then
  RESP=$(curl -s -m 60 -X POST "$BASE_URL/functions/v1/send-notifications" \
    -H "Authorization: Bearer $SRK" -H "Content-Type: application/json" \
    -d '{"trigger":"scheduled"}')
  echo "$(date) global_scheduler[digest]: $RESP"
else
  echo "$(date) global_scheduler[digest]: no service role key, skipped"
fi

# â”€â”€ Job 2: per-user engine refresh (priority user>admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
PSQL="docker exec supabase-db psql -U postgres -d postgres -A -t -c"
ADMIN_ROW=$($PSQL "SELECT COALESCE(settings->>'engineEnabled','true') || '|' || COALESCE(settings->>'engineSchedule','manual') || '|' || COALESCE(settings->>'engineScheduleCustomValue','6') || '|' || COALESCE(settings->>'engineScheduleCustomUnit','hours') FROM public.admin_settings LIMIT 1;" 2>/dev/null | tr -d '[:space:]')
ENG_ENABLED="${ADMIN_ROW%%|*}"; REST="${ADMIN_ROW#*|}"
ADMIN_SCHED="${REST%%|*}"; REST="${REST#*|}"
ADMIN_CVAL="${REST%%|*}"; ADMIN_CUNIT="${REST##*|}"
admin_interval_min() {
  case "$1" in
    hourly) echo 60 ;;
    daily)  echo 1440 ;;
    weekly) echo 10080 ;;
    custom)
      local v="${2:-1}"; local u="${3:-hours}"
      [ "$u" = "days" ] && echo $(( v * 1440 )) || echo $(( v * 60 )) ;;
    *) echo 0 ;;
  esac
}
ADMIN_MIN=$(admin_interval_min "$ADMIN_SCHED" "$ADMIN_CVAL" "$ADMIN_CUNIT")
if [ "$ENG_ENABLED" = "false" ]; then
  echo "$(date) global_scheduler[refresh]: engine disabled by admin, skipping all refreshes"
else
  USERS=$($PSQL "SELECT email_id || '|' || COALESCE(auto_refresh_enabled,false)::text || '|' || COALESCE(refresh_interval_minutes,0)::text || '|' || COALESCE(EXTRACT(EPOCH FROM last_engine_run_at)::bigint,0)::text FROM public.user_settings WHERE email_enabled = true;" 2>/dev/null)
  NOW=$(date +%s)
  echo "$USERS" | while IFS='|' read -r EMAIL AUTO UINT LASTRUN; do
    [ -z "$EMAIL" ] && continue
    EFF=0
    if [ "$AUTO" = "true" ] && [ "${UINT:-0}" -gt 0 ] 2>/dev/null; then EFF="$UINT"; else EFF="$ADMIN_MIN"; fi
    if [ "${EFF:-0}" -le 0 ] 2>/dev/null; then continue; fi
    DELTA=$(( NOW - ${LASTRUN:-0} )); THRESH=$(( EFF * 60 ))
    if [ "${LASTRUN:-0}" -eq 0 ] || [ "$DELTA" -ge "$THRESH" ]; then
      if [ -n "$SRK" ]; then
        RR=$(curl -s -m 90 -X POST "$BASE_URL/functions/v1/cve-engine" \
          -H "Authorization: Bearer $SRK" -H "Content-Type: application/json" \
          -d "{\"trigger\":\"scheduled\",\"targetEmail\":\"$EMAIL\"}")
        echo "$(date) global_scheduler[refresh]: $EMAIL (eff=${EFF}m) -> $RR"
        docker exec supabase-db psql -U postgres -d postgres -c "UPDATE public.user_settings SET last_engine_run_at = now() WHERE email_id = '$EMAIL';" >/dev/null 2>&1
        # If user is "immediate" notification, trigger send-notifications now
        # so they get the email right after the refresh finds new CVEs.
        SCHED_TYPE=$(docker exec supabase-db psql -U postgres -d postgres -A -t -c "SELECT COALESCE(cron_schedule_type,'immediate') FROM user_settings WHERE email_id='$EMAIL';" 2>/dev/null | tr -d '[:space:]')
        if [ "$SCHED_TYPE" = "immediate" ]; then
          NR=$(curl -s -m 60 -X POST "$BASE_URL/functions/v1/send-notifications" \
            -H "Authorization: Bearer $SRK" -H "Content-Type: application/json" \
            -d "{\"trigger\":\"immediate_post_refresh\",\"targetEmail\":\"$EMAIL\"}")
          echo "$(date) global_scheduler[notify-immediate]: $EMAIL -> $NR"
        fi
      fi
    fi
  done
fi

# â”€â”€ Job 3: apply fetch schedule (per-source frequency 6h/12h/daily/weekly) + source gating â”€â”€
ROW=$($PSQL "SELECT
  COALESCE(settings->>'nvdFetchTime','20:30') || '|' ||
  COALESCE(settings->>'certInFetchTime','19:30') || '|' ||
  COALESCE(settings->>'cveSourceEnabled','true') || '|' ||
  COALESCE(settings->>'certInSourceEnabled','true') || '|' ||
  COALESCE(settings->>'nvdFetchFrequency','daily') || '|' ||
  COALESCE(settings->>'certInFetchFrequency','daily') || '|' ||
  COALESCE(settings->>'nvdFetchDay','monday') || '|' ||
  COALESCE(settings->>'certInFetchDay','monday')
  FROM public.admin_settings LIMIT 1;" 2>/dev/null | tr -d '[:space:]')
[ -z "$ROW" ] && ROW="20:30|19:30|true|true|daily|daily|monday|monday"
IFS='|' read -r NVD_IST CERT_IST NVD_SRC_ON CERT_SRC_ON NVD_FREQ CERT_FREQ NVD_DAY CERT_DAY <<EOF
$ROW
EOF

# IST HH:MM -> "MIN HOUR" UTC
ist_to_utc_cron() {
  local h=$((10#${1%%:*})); local m=$((10#${1##*:}))
  local total=$(( h*60 + m - 330 ))
  while [ $total -lt 0 ]; do total=$((total+1440)); done
  total=$((total % 1440))
  echo "$((total%60)) $((total/60))"
}
# day name -> cron DOW number (0=Sun). Note: IST->UTC can shift the day for
# early-morning IST times, but for typical afternoon fetch times the day is same.
day_num() {
  case "$1" in
    sunday) echo 0;; monday) echo 1;; tuesday) echo 2;; wednesday) echo 3;;
    thursday) echo 4;; friday) echo 5;; saturday) echo 6;; *) echo 1;;
  esac
}

# Host cron runs in IST (Asia/Kolkata), so write the IST time DIRECTLY.
# "HH:MM" IST -> "MIN HOUR" (no UTC conversion).
ist_to_cron_min_hour() {
  local h=$((10#${1%%:*})); local m=$((10#${1##*:}))
  echo "$m $h"
}
# Build a full cron time expression (MIN HOUR DOM MON DOW) for a source.
build_cron_expr() {
  local freq="$1" ist="$2" day="$3"
  case "$freq" in
    6h)  echo "0 */6 * * *" ;;
    12h) echo "0 */12 * * *" ;;
    weekly)
      local mh; mh=$(ist_to_cron_min_hour "$ist")
      echo "$mh * * $(day_num "$day")" ;;
    daily|*)
      local mh; mh=$(ist_to_cron_min_hour "$ist")
      echo "$mh * * *" ;;
  esac
}

NVD_EXPR=$(build_cron_expr "$NVD_FREQ" "$NVD_IST" "$NVD_DAY")
CERT_EXPR=$(build_cron_expr "$CERT_FREQ" "$CERT_IST" "$CERT_DAY")

CURRENT=$(crontab -l 2>/dev/null || true)
FILTERED=$(printf "%s\n" "$CURRENT" \
  | grep -v "daily_nvd_extract.py" \
  | grep -v "daily_cert_extract.py" \
  | grep -v "^# Daily NVD" \
  | grep -v "^# Daily CERT" \
  | grep -v "^# NVD fetch" \
  | grep -v "^# CERT-IN fetch")

FETCH_SECTION=""
if [ "$CERT_SRC_ON" = "true" ]; then
  FETCH_SECTION="$FETCH_SECTION
# CERT-IN fetch ($CERT_FREQ, IST $CERT_IST)
$CERT_EXPR cd $PROJECT_DIR && python3 daily_cert_extract.py >> cron_cert.log 2>&1"
else
  FETCH_SECTION="$FETCH_SECTION
# CERT-IN fetch DISABLED by admin (certInSourceEnabled=false)"
fi
if [ "$NVD_SRC_ON" = "true" ]; then
  FETCH_SECTION="$FETCH_SECTION
# NVD fetch ($NVD_FREQ, IST $NVD_IST)
$NVD_EXPR cd $PROJECT_DIR && python3 daily_nvd_extract.py >> cron_nvd_daily.log 2>&1"
else
  FETCH_SECTION="$FETCH_SECTION
# NVD fetch DISABLED by admin (cveSourceEnabled=false)"
fi

NEW=$(printf "%s\n%s\n" "$FILTERED" "$FETCH_SECTION")
if [ "$CURRENT" != "$NEW" ]; then
  printf "%s\n" "$NEW" | crontab -
  echo "$(date) global_scheduler[fetch]: crontab updated (NVD $NVD_FREQ/$NVD_IST/$NVD_SRC_ON, CERT $CERT_FREQ/$CERT_IST/$CERT_SRC_ON)"
fi
