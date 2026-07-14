-- ============================================================================
-- 0137 — performance_indexes
--
-- Índices de rendimiento para escala (evidencia: auditoría 2026-07-13).
--
-- Problema 1: ai-proxy hace COUNT(*) en ai_usage por workspace_id + created_at
--   sin índice → sequential scan. A 1k workspaces × 10k filas = 10M filas/hora.
-- Problema 2: notifications, audit_log, order_events sin índices por workspace
--   + created_at → scans completos en queries frecuentes.
-- Problema 3: notification_delivery_log sin índice de deduplicación →
--   send-push hace lookup lento en ventana de 60s.
-- ============================================================================

-- ─── ai_usage ────────────────────────────────────────────────────────────────
-- Cubre: COUNT(*) WHERE workspace_id=X AND created_at >= Y (ai-proxy rate limit)
-- También cubre: SELECT historial de uso por workspace en IAAdminTab
CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_created
  ON public.ai_usage (workspace_id, created_at DESC);

-- ─── ai_usage por feature/operación (Dashboard de costos IA) ────────────────
CREATE INDEX IF NOT EXISTS idx_ai_usage_ws_feature
  ON public.ai_usage (workspace_id, feature, created_at DESC);

-- ─── notifications ────────────────────────────────────────────────────────────
-- Cubre: SELECT * WHERE workspace_id=X ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_notifications_ws_created
  ON public.notifications (workspace_id, created_at DESC);

-- Cubre: SELECT no-leídas por usuario (is_read es booleano, no timestamp)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (workspace_id, user_id, is_read)
  WHERE is_read = false;

-- ─── audit_log ───────────────────────────────────────────────────────────────
-- audit_log crece rápido; este índice cubre las queries de backoffice
CREATE INDEX IF NOT EXISTS idx_audit_log_ws_created
  ON public.audit_log (workspace_id, created_at DESC);

-- ─── notification_delivery_log ───────────────────────────────────────────────
-- Cubre: deduplicación en send-push (notification_id + user_id + created_at)
CREATE INDEX IF NOT EXISTS idx_notif_delivery_dedup
  ON public.notification_delivery_log (notification_id, user_id, created_at DESC)
  WHERE status = 'sent';

-- Cubre: historial de entregas por workspace
CREATE INDEX IF NOT EXISTS idx_notif_delivery_ws_created
  ON public.notification_delivery_log (workspace_id, created_at DESC);

-- ─── push_tokens ─────────────────────────────────────────────────────────────
-- Cubre: lookup de tokens activos por usuario en send-push
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_active
  ON public.push_tokens (workspace_id, user_id)
  WHERE is_active = true;

-- ─── active_sessions ─────────────────────────────────────────────────────────
-- Cubre: session_heartbeat lookup por device_id + workspace_id
CREATE INDEX IF NOT EXISTS idx_active_sessions_device
  ON public.active_sessions (workspace_id, device_id);

-- ─── order_events ────────────────────────────────────────────────────────────
-- Cubre: COUNT por workspace en dashboards del portal
CREATE INDEX IF NOT EXISTS idx_order_events_ws_created
  ON public.order_events (workspace_id, created_at DESC);

-- AUTOVACUUM: omitido — ai_usage es tabla particionada en producción.
-- Los parámetros de autovacuum se aplican a nivel de partición individual, no aquí.
