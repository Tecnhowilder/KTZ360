-- ============================================================================
-- 0138 — pg_cron_jobs
--
-- Registra los jobs de pg_cron que antes solo estaban comentados o en DO blocks
-- condicionales. Si pg_cron no está habilitado, el bloque falla silenciosamente.
--
-- Jobs registrados:
--   1. expire_overdue_quotes     — cada 6 horas
--   2. cleanup_expired_sessions  — cada hora
--   3. cleanup_old_audit_log     — diario a las 3:00 UTC
--   4. integration_worker_cron   — cada minuto (si pg_net disponible)
--
-- Requisito: habilitar pg_cron y pg_net en Supabase Dashboard
--   → Database → Extensions → pg_cron, pg_net
-- ============================================================================

DO $body$
DECLARE
  v_cron_ok boolean;
  v_net_ok  boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_cron_ok;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')  INTO v_net_ok;

  IF NOT v_cron_ok THEN
    RAISE NOTICE '0138: pg_cron no está habilitado — habilitar en Dashboard > Extensions > pg_cron';
    RETURN;
  END IF;

  -- ── Job 1: Vencer cotizaciones expiradas cada 6 horas ─────────────────────
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'expire_overdue_quotes') THEN
    PERFORM cron.unschedule('shelwi-expire-quotes');
    PERFORM cron.schedule(
      'shelwi-expire-quotes',
      '0 */6 * * *',
      'SELECT public.expire_overdue_quotes(NULL)'
    );
    RAISE NOTICE '0138: job shelwi-expire-quotes registrado (cada 6h)';
  END IF;

  -- ── Job 2: Limpiar sesiones expiradas cada hora ───────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'active_sessions') THEN
    PERFORM cron.unschedule('shelwi-cleanup-sessions');
    PERFORM cron.schedule(
      'shelwi-cleanup-sessions',
      '5 * * * *',
      'DELETE FROM public.active_sessions WHERE expires_at < now() - interval ''1 hour'''
    );
    RAISE NOTICE '0138: job shelwi-cleanup-sessions registrado (cada hora)';
  END IF;

  -- ── Job 3: Rotar audit_log > 90 días (diario a las 3:00 UTC) ─────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_log') THEN
    PERFORM cron.unschedule('shelwi-rotate-audit-log');
    PERFORM cron.schedule(
      'shelwi-rotate-audit-log',
      '0 3 * * *',
      'DELETE FROM public.audit_log WHERE created_at < now() - interval ''90 days'''
    );
    RAISE NOTICE '0138: job shelwi-rotate-audit-log registrado (diario 03:00 UTC)';
  END IF;

  -- ── Job 4: Limpiar ai_usage > 12 meses ───────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_usage') THEN
    PERFORM cron.unschedule('shelwi-rotate-ai-usage');
    PERFORM cron.schedule(
      'shelwi-rotate-ai-usage',
      '30 3 1 * *',
      'DELETE FROM public.ai_usage WHERE created_at < now() - interval ''12 months'''
    );
    RAISE NOTICE '0138: job shelwi-rotate-ai-usage registrado (mensual)';
  END IF;

  -- ── Job 5: Limpiar notification_delivery_log > 30 días ───────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_delivery_log') THEN
    PERFORM cron.unschedule('shelwi-rotate-delivery-log');
    PERFORM cron.schedule(
      'shelwi-rotate-delivery-log',
      '45 3 * * 0',
      'DELETE FROM public.notification_delivery_log WHERE created_at < now() - interval ''30 days'''
    );
    RAISE NOTICE '0138: job shelwi-rotate-delivery-log registrado (semanal)';
  END IF;

  IF v_net_ok THEN
    PERFORM cron.unschedule('shelwi-integration-worker');
    RAISE NOTICE '0138: pg_net disponible — integration-worker debe configurarse manualmente con la URL del proyecto';
  ELSE
    RAISE NOTICE '0138: pg_net no disponible — integration-worker requiere invocación manual';
  END IF;

END;
$body$;
