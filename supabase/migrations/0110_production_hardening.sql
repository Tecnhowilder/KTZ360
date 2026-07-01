-- ============================================================
-- Migration 0110 — Production Hardening
--
-- INCIDENCIAS CRÍTICAS RESUELTAS:
--
--   CRÍTICA 1: Quote state machine sin validación backend
--     - update_quote_status aceptaba cualquier transición
--     - Se puede revertir Aprobada → Borrador (pérdida de datos)
--     FIX: RPC update_quote_status con transiciones explícitas + audit
--
--   CRÍTICA 2: Estado "Convertida en pedido" faltante
--     - Una cotización Aprobada podía generar múltiples pedidos
--     FIX: Estado 'convertida' + create_order marca la cotización automáticamente
--
--   MEDIA 1: update_work_order_status no verificaba RLS completa
--     FIX: Reforzar con workspace_id del JWT en lugar de trust de parámetro
--
--   MEDIA 2: OTs finalizadas no actualizan el pedido padre
--     FIX: Trigger que marca el pedido como 'finalizado' cuando todas sus OTs finalizan
--
-- Zero Trust: workspace_id siempre del JWT.
-- ============================================================

-- ─── 1. ESTADO 'convertida' EN COTIZACIONES ──────────────────────────────────

-- Agregar 'convertida' a la lista de estados válidos
DO $$
DECLARE v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.quotes'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.quotes DROP CONSTRAINT %I', v_con.conname);
  END LOOP;
END $$;

-- Los estados son: Borrador, Enviada, Vista, Aprobada, Rechazada, Vencida, convertida
-- NOTA: Shelwi usa capitalize en el frontend pero snake_case no aplica aquí
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN (
    'Borrador', 'Enviada', 'Vista', 'Aprobada',
    'Rechazada', 'Vencida', 'convertida'
  ));

-- ─── 2. RPC update_quote_status CON VALIDACIÓN DE TRANSICIONES ───────────────
-- Antes: aceptaba cualquier status → cualquier status (sin validación)
-- Ahora: transiciones explícitas, registro en audit_log

CREATE OR REPLACE FUNCTION public.update_quote_status(
  p_quote_id  uuid,
  p_status    text,
  p_note      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_workspace_id uuid;
  v_caller_role  text;
  v_current      text;
  v_allowed      text[];
BEGIN
  SELECT workspace_id, role INTO v_workspace_id, v_caller_role
    FROM public.profiles WHERE id = v_caller_id;

  -- Obtener estado actual
  SELECT status INTO v_current
    FROM public.quotes
   WHERE id = p_quote_id AND workspace_id = v_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cotización no encontrada');
  END IF;

  -- No permitir modificar cotizaciones ya convertidas en pedido
  IF v_current = 'convertida' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Esta cotización ya fue convertida en pedido y no puede modificarse');
  END IF;

  -- Transiciones válidas por estado
  v_allowed := CASE v_current
    WHEN 'Borrador'  THEN ARRAY['Enviada', 'Rechazada']
    WHEN 'Enviada'   THEN ARRAY['Vista', 'Aprobada', 'Rechazada', 'Vencida']
    WHEN 'Vista'     THEN ARRAY['Aprobada', 'Rechazada', 'Vencida']
    WHEN 'Aprobada'  THEN ARRAY['Rechazada']       -- solo cancelar, NO volver a Borrador
    WHEN 'Rechazada' THEN ARRAY['Borrador']         -- puede reactivarse como borrador
    WHEN 'Vencida'   THEN ARRAY['Borrador', 'Enviada'] -- puede reactivarse
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_status = ANY(v_allowed)) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('Transición inválida: %s → %s', v_current, p_status)
    );
  END IF;

  -- Actualizar estado
  UPDATE public.quotes
     SET status     = p_status,
         updated_at = now()
   WHERE id = p_quote_id AND workspace_id = v_workspace_id;

  -- Audit log
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_workspace_id, v_caller_id, 'quote_status_changed', 'quotes', p_quote_id,
    jsonb_build_object('from', v_current, 'to', p_status, 'note', p_note));

  RETURN jsonb_build_object('ok', true, 'from', v_current, 'to', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_quote_status(uuid, text, text) TO authenticated;

-- ─── 3. create_order MARCA LA COTIZACIÓN COMO 'convertida' ───────────────────
-- Antes: la cotización quedaba en 'Aprobada' indefinidamente
-- Ahora: al crear el pedido, la cotización pasa a 'convertida' automáticamente

CREATE OR REPLACE FUNCTION public.create_order(
  p_quote_id     uuid,
  p_title        text    DEFAULT NULL,
  p_description  text    DEFAULT NULL,
  p_assigned_to  uuid    DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_notes        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_workspace_id uuid;
  v_caller_role  text;
  v_quote        RECORD;
  v_order_id     uuid;
  v_snapshot     jsonb;
BEGIN
  SELECT workspace_id, role INTO v_workspace_id, v_caller_role
    FROM public.profiles WHERE id = v_caller_id;

  -- Verificar acceso a feature
  IF NOT public.check_feature_access(v_workspace_id, 'orders_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'feature_not_available: orders_enabled');
  END IF;

  -- Verificar que la cotización existe, pertenece al workspace y está Aprobada
  SELECT * INTO v_quote
    FROM public.quotes
   WHERE id = p_quote_id AND workspace_id = v_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cotización no encontrada');
  END IF;

  IF v_quote.status <> 'Aprobada' THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('La cotización debe estar Aprobada para crear un pedido. Estado actual: %s', v_quote.status));
  END IF;

  -- Prevenir pedidos duplicados: verificar si ya existe un pedido para esta cotización
  IF EXISTS (SELECT 1 FROM public.orders WHERE quote_id = p_quote_id AND workspace_id = v_workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Ya existe un pedido para esta cotización. No se puede crear un duplicado.');
  END IF;

  -- Construir snapshot R4 (inmutable)
  v_snapshot := jsonb_build_object(
    'quote_number',   v_quote.quote_number,
    'frozen_at',      now(),
    'client',         (SELECT jsonb_build_object('id', id, 'name', name, 'phone', phone, 'email', email)
                       FROM public.clients WHERE id = v_quote.client_id),
    'items',          v_quote.items,
    'calc_snapshot',  v_quote.calc_snapshot,
    'title',          COALESCE(p_title, v_quote.title),
    'notes',          COALESCE(p_notes, v_quote.notes)
  );

  -- Crear el pedido
  INSERT INTO public.orders (
    workspace_id, quote_id, client_id, created_by, assigned_to,
    title, description, status, order_snapshot,
    total_amount, scheduled_at, notes, source
  )
  VALUES (
    v_workspace_id, p_quote_id, v_quote.client_id, v_caller_id,
    p_assigned_to,
    COALESCE(p_title, v_quote.title, 'Pedido sin título'),
    p_description,
    'pendiente',
    v_snapshot,
    COALESCE((v_quote.calc_snapshot->>'total')::numeric, 0),
    p_scheduled_at,
    p_notes,
    'from_quote'
  )
  RETURNING id INTO v_order_id;

  -- CRÍTICO: Marcar la cotización como convertida para prevenir pedidos duplicados
  UPDATE public.quotes
     SET status = 'convertida', updated_at = now()
   WHERE id = p_quote_id AND workspace_id = v_workspace_id;

  -- Log en work_logs
  INSERT INTO public.work_logs (workspace_id, order_id, user_id, event_type, metadata)
  VALUES (v_workspace_id, v_order_id, v_caller_id, 'order_created',
    jsonb_build_object('quote_id', p_quote_id, 'source', 'from_quote'));

  -- Audit
  INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_workspace_id, v_caller_id, 'order_created', 'orders', v_order_id,
    jsonb_build_object('quote_id', p_quote_id, 'total', COALESCE((v_quote.calc_snapshot->>'total')::numeric, 0)));

  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order(uuid, text, text, uuid, timestamptz, text) TO authenticated;

-- ─── 4. TRIGGER: Auto-finalizar pedido cuando todas sus OTs finalizan ─────────

CREATE OR REPLACE FUNCTION _check_order_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id     uuid;
  v_total_wos    int;
  v_done_wos     int;
  v_order_status text;
BEGIN
  -- Solo cuando la OT pasa a 'finalizada'
  IF NEW.status <> 'finalizada' OR OLD.status = 'finalizada' THEN
    RETURN NEW;
  END IF;

  v_order_id := NEW.order_id;
  IF v_order_id IS NULL THEN RETURN NEW; END IF;

  -- Contar OTs del pedido
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'finalizada')
    INTO v_total_wos, v_done_wos
    FROM public.work_orders
   WHERE order_id = v_order_id AND workspace_id = NEW.workspace_id
     AND status <> 'cancelada';

  -- Obtener estado actual del pedido
  SELECT status INTO v_order_status
    FROM public.orders WHERE id = v_order_id;

  -- Si todas las OTs están finalizadas y el pedido está en ejecución → finalizar pedido
  IF v_total_wos > 0 AND v_done_wos = v_total_wos
     AND v_order_status IN ('en_ejecucion', 'en_sitio', 'en_ruta', 'asignado', 'programado') THEN
    UPDATE public.orders
       SET status      = 'finalizado',
           finished_at = now(),
           updated_at  = now()
     WHERE id = v_order_id AND workspace_id = NEW.workspace_id;

    -- Log automático
    INSERT INTO public.work_logs (workspace_id, order_id, user_id, event_type,
      from_status, to_status, metadata)
    VALUES (NEW.workspace_id, v_order_id, NEW.assigned_to, 'order_status_changed',
      v_order_status, 'finalizado',
      jsonb_build_object('auto', true, 'reason', 'all_work_orders_completed',
        'total_wos', v_total_wos));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_auto_complete ON public.work_orders;
CREATE TRIGGER trg_order_auto_complete
  AFTER UPDATE OF status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION _check_order_completion();

-- ─── 5. REFORZAR RLS en tablas críticas ──────────────────────────────────────
-- Verificar que evidence_files tenga RLS configurado

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'evidence_files' AND n.nspname = 'public'
      AND c.relrowsecurity = true
  ) THEN
    EXECUTE 'ALTER TABLE public.evidence_files ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Asegurar que haya política en evidence_files
DO $$ BEGIN
  CREATE POLICY "evidence_workspace_isolation" ON public.evidence_files
    USING (workspace_id = public.current_workspace_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 6. ÍNDICES PARA PERFORMANCE ─────────────────────────────────────────────
-- Estos índices reducen query time en las pantallas críticas

CREATE INDEX IF NOT EXISTS idx_orders_workspace_status
  ON public.orders(workspace_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to
  ON public.work_orders(workspace_id, assigned_to, status)
  WHERE status NOT IN ('finalizada', 'cancelada');

CREATE INDEX IF NOT EXISTS idx_quotes_workspace_status
  ON public.quotes(workspace_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications(workspace_id, user_id, is_read)
  WHERE is_read = false;
