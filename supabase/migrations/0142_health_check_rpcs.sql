-- ============================================================================
-- 0142 — RPCs para Health Checks desde el Backoffice
-- ============================================================================

-- ─── check_system_health: latencia DB + conectividad básica ─────────────────
CREATE OR REPLACE FUNCTION check_system_health()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok',         true,
    'pg_version', version(),
    'now',        now()
  );
$$;

-- Solo super_admin puede ejecutar
REVOKE EXECUTE ON FUNCTION check_system_health() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION check_system_health() TO authenticated;

-- ─── get_cron_job_status: lista jobs pg_cron activos ─────────────────────────
CREATE OR REPLACE FUNCTION get_cron_job_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'jobname',  jobname,
    'schedule', schedule,
    'command',  command,
    'active',   active
  ))
  INTO v_jobs
  FROM cron.job
  WHERE jobname LIKE 'shelwi-%'
    AND active = true;

  RETURN COALESCE(v_jobs, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION get_cron_job_status() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_cron_job_status() TO authenticated;

COMMENT ON FUNCTION check_system_health  IS 'Health check DB: latencia + versión PostgreSQL.';
COMMENT ON FUNCTION get_cron_job_status  IS 'Lista jobs pg_cron activos de Shelwi para health dashboard.';
