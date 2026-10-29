#!/bin/bash
# sync_digest_cron.sh — reads distinct daily/weekly digest schedules from
# user_settings and writes EXACT cron lines (IST->UTC) that trigger the digest
# at precisely those times. No polling. One cron line per distinct schedule.
#
# Run this: (a) once a day via a single cron, and (b) on-demand after a user
# saves their schedule (optional). It rewrites only the digest-trigger lines.
#
# Lightweight: one psql read + crontab rewrite. The actual email work happens
# in the edge function, only at the exact scheduled minute.

set -e
PROJECT_DIR="/home/avotrix/Vulnerix"
TRIGGER="bash $PROJECT_DIR/run_digest_scheduler.sh"

# Convert IST HH:MM -> "MIN HOUR" in UTC (IST = UTC + 5:30).
ist_to_utc() {
  local h=$((10#${1%%:*})); local m=$((10#${1##*:}))
  local total=$(( h*60 + m - 330 ))
  while [ $total -lt 0 ]; do total=$((total+1440)); done
  total=$((total % 1440))
  echo "$((total%60)) $((total/60))"
}

# Day name -> cron dow number.
dow() { case "$1" in sunday)echo 0;; monday)echo 1;; tuesday)echo 2;; wednesday)echo 3;; thursday)echo 4;; friday)echo 5;; saturday)echo 6;; *)echo "*";; esac; }

# Pull distinct enabled daily/weekly schedules. Format: type|time|day
ROWS=$(docker exec supabase-db psql -U postgres -d postgres -A -t -c \
  "SELECT DISTINCT cron_schedule_type || '|' || COALESCE(cron_time,'09:00_AM') || '|' || COALESCE(cron_day,'monday') \
   FROM public.user_settings \
   WHERE email_enabled = true AND cron_schedule_type IN ('daily','weekly');" 2>/dev/null)

# Build the set of exact cron lines (dedup by cron expression).
declare -A LINES
while IFS= read -r row; do
  [ -z "$row" ] && continue
  TYPE="${row%%|*}"; REST="${row#*|}"; TIME="${REST%%|*}"; DAY="${REST##*|}"
  # TIME is "HH:MM_AM/PM" -> convert to 24h HH:MM
  HHMM="${TIME%_*}"; AP="${TIME##*_}"
  H=$((10#${HHMM%%:*})); M="${HHMM##*:}"
  [ "$AP" = "PM" ] && [ "$H" -ne 12 ] && H=$((H+12))
  [ "$AP" = "AM" ] && [ "$H" -eq 12 ] && H=0
  UTC=$(ist_to_utc "$(printf '%02d:%s' "$H" "$M")")
  UMIN="${UTC%% *}"; UHOUR="${UTC##* }"
  if [ "$TYPE" = "daily" ]; then
    EXPR="$UMIN $UHOUR * * *"
  else
    EXPR="$UMIN $UHOUR * * $(dow "$DAY")"
  fi
  LINES["$EXPR"]=1
done <<< "$ROWS"

# Rewrite crontab: keep everything except prior digest-trigger lines.
CURRENT=$(crontab -l 2>/dev/null || true)
FILTERED=$(printf "%s\n" "$CURRENT" | grep -v "run_digest_scheduler.sh" | grep -v "^# Vulnerix digest")

NEW="$FILTERED"
NEW="$NEW
# Vulnerix digest triggers (exact per-schedule, IST->UTC)"
for expr in "${!LINES[@]}"; do
  NEW="$NEW
$expr $TRIGGER >> $PROJECT_DIR/cron_digest.log 2>&1"
done

printf "%s\n" "$NEW" | crontab -
echo "$(date) sync_digest_cron: installed ${#LINES[@]} exact digest cron line(s)"
crontab -l | grep -A20 "Vulnerix digest triggers" || true
