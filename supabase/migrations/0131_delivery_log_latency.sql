-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0131: agregar latency_ms a notification_delivery_log
-- ════════════════════════════════════════════════════════════════════════════
-- Requerido por la especificación de auditoría Push+Realtime:
--   latency_ms → tiempo de ida/vuelta FCM en milisegundos.
--   Permite monitorear latencia de entrega por plataforma (ios/android).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.notification_delivery_log
  ADD COLUMN IF NOT EXISTS latency_ms integer;

COMMENT ON COLUMN public.notification_delivery_log.latency_ms
  IS 'FCM HTTP v1 round-trip latency in milliseconds';
