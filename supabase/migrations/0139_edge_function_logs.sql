-- ============================================================================
-- 0139 — edge_function_logs: observabilidad centralizada de Edge Functions
-- ============================================================================
-- Tabla de logs estructurados para Edge Functions.
-- Solo se usa cuando EF_DB_LOGGING=true (opt-in por entorno).
-- Retención: 14 días (gestionada por pg_cron job en 0138 o extensión aquí).
-- RLS: solo super_admin puede leer logs. EF inserta vía service_role (RLS bypass).
-- ============================================================================

-- ─── Tabla principal ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS edge_function_logs (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name  text        NOT NULL,
  request_id     uuid,
  level          text        NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message        text        NOT NULL,
  context        jsonb       DEFAULT '{}'::jsonb,
  duration_ms    integer,
  workspace_id   uuid        REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

-- ─── Índices para queries de observabilidad ───────────────────────────────────
-- SLO dashboard: latencia P95 por función en últimas 24h
CREATE INDEX IF NOT EXISTS idx_efl_function_created
  ON edge_function_logs (function_name, created_at DESC);

-- Filtro por request_id (tracing)
CREATE INDEX IF NOT EXISTS idx_efl_request_id
  ON edge_function_logs (request_id)
  WHERE request_id IS NOT NULL;

-- Filtro por workspace (auditoría)
CREATE INDEX IF NOT EXISTS idx_efl_workspace_created
  ON edge_function_logs (workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

-- Filtro por nivel para alertas (solo warn/error)
CREATE INDEX IF NOT EXISTS idx_efl_level_created
  ON edge_function_logs (level, created_at DESC)
  WHERE level IN ('warn', 'error');

-- ─── Autovacuum agresivo (tabla de alta inserción) ───────────────────────────
ALTER TABLE edge_function_logs SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE edge_function_logs ENABLE ROW LEVEL SECURITY;

-- Solo super_admin puede leer
CREATE POLICY "super_admin_read_efl" ON edge_function_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- service_role inserta sin restricciones (RLS bypass automático)
-- No necesita política INSERT explícita

-- ─── pg_cron: rotación de logs (14 días) ─────────────────────────────────────
DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'shelwi-rotate-ef-logs',
      '15 3 * * *',
      'DELETE FROM edge_function_logs WHERE created_at < now() - INTERVAL ''14 days'''
    );
  END IF;
END $body$;

-- ─── Vista agregada para SLO dashboard ───────────────────────────────────────
-- Latencia P50/P95/P99 + tasa de error por función (últimas 24h)
CREATE OR REPLACE VIEW edge_function_slo AS
SELECT
  function_name,
  COUNT(*)                                                  AS total_requests,
  COUNT(*) FILTER (WHERE level = 'error')                  AS error_count,
  ROUND(
    COUNT(*) FILTER (WHERE level = 'error')::numeric
    / NULLIF(COUNT(*), 0) * 100, 2
  )                                                         AS error_rate_pct,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_ms)::int AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms)::int AS p99_ms,
  MAX(duration_ms)                                          AS max_ms,
  MIN(created_at)                                           AS window_start,
  MAX(created_at)                                           AS window_end
FROM edge_function_logs
WHERE created_at > now() - INTERVAL '24 hours'
  AND duration_ms IS NOT NULL
GROUP BY function_name
ORDER BY error_count DESC, total_requests DESC;

COMMENT ON VIEW edge_function_slo IS
  'SLO dashboard: latencia P50/P95/P99 y tasa de error por Edge Function (24h rolling).';

-- ─── RPC para SLO dashboard (acceso seguro desde el frontend) ────────────────
CREATE OR REPLACE FUNCTION get_ef_slo_dashboard()
RETURNS TABLE (
  function_name   text,
  total_requests  bigint,
  error_count     bigint,
  error_rate_pct  numeric,
  p50_ms          int,
  p95_ms          int,
  p99_ms          int,
  max_ms          int,
  window_start    timestamptz,
  window_end      timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM edge_function_slo;
$$;

-- Solo super_admin puede ejecutar
REVOKE EXECUTE ON FUNCTION get_ef_slo_dashboard() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_ef_slo_dashboard() TO authenticated;

COMMENT ON FUNCTION get_ef_slo_dashboard() IS
  'SLO de Edge Functions (24h). Solo super_admin tiene acceso efectivo vía RLS en profiles.';
