-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0095: Webhook Dispatch — Extender triggers existentes
-- ════════════════════════════════════════════════════════════════════════════
-- NO se crean triggers nuevos.
-- Se extienden con CREATE OR REPLACE las funciones de Sprint 13:
--   trg_quotes_automation_dispatch
--   trg_orders_automation_dispatch
--   trg_work_orders_automation_dispatch
-- Cada función mantiene su lógica original + añade dispatch_webhook_event().
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Extender trg_quotes_automation_dispatch ───────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_quotes_automation_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload     jsonb;
  v_client_name text;
  v_event_type  text;
BEGIN
  SELECT name INTO v_client_name FROM public.clients WHERE id = new.client_id;

  v_payload := jsonb_build_object(
    'quote_id',     new.id,
    'quote_number', new.quote_number,
    'title',        new.title,
    'client_id',    new.client_id,
    'client_name',  v_client_name,
    'total',        COALESCE((new.calc_snapshot->>'total')::numeric, 0),
    'status',       new.status,
    'sent_at',      new.sent_at
  );

  -- INSERT: cotización creada
  IF tg_op = 'INSERT' THEN
    -- Automatizaciones (lógica original Sprint 13)
    PERFORM public.evaluate_and_queue_automations(
      new.workspace_id, 'quote_created', 'quote', new.id, v_payload
    );
    -- Webhooks (nuevo: despacha a endpoints suscritos a 'quote_created')
    PERFORM public.dispatch_webhook_event(
      new.workspace_id, 'quote_created', 'quote', new.id, v_payload
    );
  END IF;

  -- UPDATE: cambios de status
  IF tg_op = 'UPDATE' AND old.status != new.status THEN
    CASE new.status
      WHEN 'Enviada' THEN
        v_event_type := 'quote_sent';
      WHEN 'Aprobada' THEN
        v_event_type := 'quote_approved';
      WHEN 'Rechazada' THEN
        v_event_type := 'quote_rejected';
      ELSE
        v_event_type := NULL;
    END CASE;

    IF v_event_type IS NOT NULL THEN
      -- Automatizaciones (lógica original Sprint 13)
      PERFORM public.evaluate_and_queue_automations(
        new.workspace_id, v_event_type, 'quote', new.id, v_payload
      );
      -- Webhooks
      PERFORM public.dispatch_webhook_event(
        new.workspace_id, v_event_type, 'quote', new.id, v_payload
      );
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- ─── 2. Extender trg_orders_automation_dispatch ───────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_orders_automation_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload     jsonb;
  v_client_name text;
BEGIN
  SELECT name INTO v_client_name FROM public.clients WHERE id = new.client_id;

  v_payload := jsonb_build_object(
    'order_id',      new.id,
    'order_number',  new.order_number,
    'title',         new.title,
    'client_id',     new.client_id,
    'client_name',   v_client_name,
    'total_amount',  new.total_amount,
    'status',        new.status,
    'quote_id',      new.quote_id
  );

  -- INSERT: pedido creado
  IF tg_op = 'INSERT' THEN
    PERFORM public.evaluate_and_queue_automations(
      new.workspace_id, 'order_created', 'order', new.id, v_payload
    );
    -- Webhooks
    PERFORM public.dispatch_webhook_event(
      new.workspace_id, 'order_created', 'order', new.id, v_payload
    );
  END IF;

  -- UPDATE: pedido finalizado
  IF tg_op = 'UPDATE' AND old.status != new.status AND new.status = 'finalizado' THEN
    PERFORM public.evaluate_and_queue_automations(
      new.workspace_id, 'order_completed', 'order', new.id, v_payload
    );
    -- Webhooks
    PERFORM public.dispatch_webhook_event(
      new.workspace_id, 'order_completed', 'order', new.id, v_payload
    );
  END IF;

  RETURN new;
END;
$$;

-- ─── 3. Extender trg_work_orders_automation_dispatch ─────────────────────────

CREATE OR REPLACE FUNCTION public.trg_work_orders_automation_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload      jsonb;
  v_assignee     text;
  v_order_number text;
BEGIN
  SELECT p.full_name INTO v_assignee FROM public.profiles p WHERE p.id = new.assigned_to;
  SELECT o.order_number INTO v_order_number FROM public.orders o WHERE o.id = new.order_id;

  v_payload := jsonb_build_object(
    'work_order_id',      new.id,
    'work_order_number',  new.work_order_number,
    'title',              new.title,
    'order_id',           new.order_id,
    'order_number',       v_order_number,
    'assigned_to',        new.assigned_to,
    'assigned_to_name',   v_assignee,
    'status',             new.status,
    'priority',           new.priority,
    'scheduled_at',       new.scheduled_at,
    'started_at',         new.started_at,
    'finished_at',        new.finished_at,
    -- Duración en horas si está finalizada
    'duration_hours', CASE
      WHEN new.started_at IS NOT NULL AND new.finished_at IS NOT NULL
      THEN round(EXTRACT(EPOCH FROM (new.finished_at - new.started_at)) / 3600.0, 2)
      ELSE NULL
    END
  );

  -- INSERT: OT creada
  IF tg_op = 'INSERT' THEN
    PERFORM public.evaluate_and_queue_automations(
      new.workspace_id, 'work_order_created', 'work_order', new.id, v_payload
    );
    -- Webhooks
    PERFORM public.dispatch_webhook_event(
      new.workspace_id, 'work_order_created', 'work_order', new.id, v_payload
    );
  END IF;

  -- UPDATE: cambios de status
  IF tg_op = 'UPDATE' AND old.status != new.status THEN
    -- OT finalizada
    IF new.status = 'finalizada' THEN
      PERFORM public.evaluate_and_queue_automations(
        new.workspace_id, 'work_order_completed', 'work_order', new.id, v_payload
      );
      -- Webhooks
      PERFORM public.dispatch_webhook_event(
        new.workspace_id, 'work_order_completed', 'work_order', new.id, v_payload
      );
    END IF;
  END IF;

  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.trg_quotes_automation_dispatch    IS 'Sprint 13 extendido: automatizaciones + webhooks salientes (Sprint Webhooks).';
COMMENT ON FUNCTION public.trg_orders_automation_dispatch    IS 'Sprint 13 extendido: automatizaciones + webhooks salientes (Sprint Webhooks).';
COMMENT ON FUNCTION public.trg_work_orders_automation_dispatch IS 'Sprint 13 extendido: automatizaciones + webhooks salientes (Sprint Webhooks).';
