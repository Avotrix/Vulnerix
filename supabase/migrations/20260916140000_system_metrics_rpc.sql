-- Real system metrics for the admin System Health page.
-- Returns actual Postgres stats (no fake numbers). Admin-gated in the function.
-- Host CPU/RAM/disk are not reachable from Postgres, so we expose DB-level
-- metrics that are genuinely measurable: DB size, connection usage, uptime,
-- transaction commit ratio.

CREATE OR REPLACE FUNCTION public.get_system_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_db_size_bytes  bigint;
  v_db_size_pretty text;
  v_max_conn       int;
  v_total_conn     int;
  v_active_conn    int;
  v_idle_conn      int;
  v_uptime_seconds bigint;
  v_commits        bigint;
  v_rollbacks      bigint;
BEGIN
  -- Only admins may read system metrics
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT pg_database_size(current_database()) INTO v_db_size_bytes;
  SELECT pg_size_pretty(v_db_size_bytes) INTO v_db_size_pretty;
  SELECT setting::int FROM pg_settings WHERE name = 'max_connections' INTO v_max_conn;
  SELECT count(*) FROM pg_stat_activity INTO v_total_conn;
  SELECT count(*) FROM pg_stat_activity WHERE state = 'active' INTO v_active_conn;
  SELECT count(*) FROM pg_stat_activity WHERE state = 'idle' INTO v_idle_conn;
  SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::bigint INTO v_uptime_seconds;
  SELECT xact_commit, xact_rollback
    FROM pg_stat_database WHERE datname = current_database()
    INTO v_commits, v_rollbacks;

  result := jsonb_build_object(
    'db_size_bytes',    v_db_size_bytes,
    'db_size_pretty',   v_db_size_pretty,
    'max_connections',  v_max_conn,
    'total_connections', v_total_conn,
    'active_connections', v_active_conn,
    'idle_connections', v_idle_conn,
    'connection_pct',   round((v_total_conn::numeric / NULLIF(v_max_conn, 0)) * 100, 1),
    'uptime_seconds',   v_uptime_seconds,
    'commits',          v_commits,
    'rollbacks',        v_rollbacks,
    'commit_ratio_pct', round((v_commits::numeric / NULLIF(v_commits + v_rollbacks, 0)) * 100, 2),
    'captured_at',      now()
  );
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_metrics TO authenticated, service_role;
