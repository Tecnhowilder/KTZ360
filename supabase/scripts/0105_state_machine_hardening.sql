-- ============================================================================
-- 0105 — state_machine_hardening: Máquina de estados operativa + bitácora
-- ============================================================================
-- FASE 5: Reglas de negocio en update_order_status (backend, no frontend).
--
-- Reglas:
--   'asignado'     → solo si assigned_to IS NOT NULL
--   'programado'   → solo si scheduled_at IS NOT NULL
--   'en_ruta'      → solo si assigned_to IS NOT NULL (GPS real en Fase GPS)
--   'en_ejecucion' → requiere estado previo en_sitio o programado
--   'finalizado'   → requiere en_ejecucion (no puede saltar)
--   'facturado'    → solo desde finalizado
--
-- Bitácora enriquecida: guarda user_agent + ip (via request.headers PostgREST)
-- ============================================================================

-- ─── 1. Columna metadata en work_logs (si no existe) ─────────────────────────

ALTER TABLE public.work_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.work_logs.metadata IS
  'FASE 5: Metadatos de auditoría: user_agent, ip, device. Zero Trust.';

-- ─── 2. Actualizar update_order_status con reglas de negocio ─────────────────

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id  uuid,
  p_new_status text,
  p_note       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_order        record;
  v_user_agent   text;
  v_ip           text;
  v_allowed_from text[];
BEGIN
  -- Zero Trust: obtener workspace del JWT
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.profiles WHERE id = v_user_id;

  -- Feature gating: PREMIUM
  IF NOT public.check_feature_access(v_workspace_id, 'orders_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'orders_not_included');
  END IF;

  -- Obtener pedido completo (pertenece al workspace)
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND workspace_id = v_workspace_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  IF v_order.status = p_new_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El pedido ya está en ese estado');
  END IF;

  -- ── Máquina de estados: transiciones permitidas ──────────────────────────
  v_allowed_from := CASE v_order.status
    WHEN 'pendiente'    THEN ARRAY['asignado', 'programado', 'cancelado']
    WHEN 'asignado'     THEN ARRAY['programado', 'en_ejecucion', 'cancelado']
    WHEN 'programado'   THEN ARRAY['en_ruta', 'en_ejecucion', 'cancelado']
    WHEN 'en_ruta'      THEN ARRAY['en_sitio', 'cancelado']
    WHEN 'en_sitio'     THEN ARRAY['en_ejecucion', 'cancelado']
    WHEN 'en_ejecucion' THEN ARRAY['pausado', 'finalizado', 'cancelado']
    WHEN 'pausado'      THEN ARRAY['en_ejecucion', 'cancelado']
    WHEN 'finalizado'   THEN ARRAY['facturado']
    WHEN 'facturado'    THEN ARRAY[]::text[]
    WHEN 'cancelado'    THEN ARRAY[]::text[]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed_from)) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('No se puede pasar de "%s" a "%s"', v_order.status, p_new_status)
    );
  END IF;

  -- ── Reglas de negocio ────────────────────────────────────────────────────

  -- 'asignado' solo si hay técnico
  IF p_new_status = 'asignado' AND v_order.assigned_to IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Debes asignar un técnico antes de marcar el pedido como Asignado'
    );
  END IF;

  -- 'programado' solo si hay fecha programada
  IF p_new_status = 'programado' AND v_order.scheduled_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Debes programar una fecha antes de marcar el pedido como Programado'
    );
  END IF;

  -- 'en_ruta' solo si hay técnico asignado
  IF p_new_status = 'en_ruta' AND v_order.assigned_to IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No hay técnico asignado para esta ruta'
    );
  END IF;

  -- 'facturado' no se puede cancelar
  IF v_order.status = 'facturado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Un pedido facturado no puede cambiar de estado');
  END IF;

  -- ── Obtener IP + User-Agent de los headers PostgREST ─────────────────────
  BEGIN
    v_ip         := COALESCE(
      (current_setting('request.headers', true)::jsonb->>'x-forwarded-for'),
      (current_setting('request.headers', true)::jsonb->>'x-real-ip'),
      'unknown'
    );
    v_user_agent := COALESCE(
      (current_setting('request.headers', true)::jsonb->>'user-agent'),
      'unknown'
    );
  EXCEPTION WHEN others THEN
    v_ip         := 'unknown';
    v_user_agent := 'unknown';
  END;

  -- ── Actualizar estado ────────────────────────────────────────────────────
  UPDATE public.orders SET
    status     = p_new_status,
    started_at = CASE WHEN p_new_status = 'en_ejecucion' AND started_at IS NULL THEN now() ELSE started_at END,
    finished_at = CASE WHEN p_new_status IN ('finalizado', 'facturado') THEN now() ELSE finished_at END,
    updated_at = now()
  WHERE id = p_order_id;

  -- ── Bitácora enriquecida ─────────────────────────────────────────────────
  INSERT INTO public.work_logs
    (order_id, work_order_id, user_id, event_type, from_status, to_status, note, metadata)
  VALUES (
    p_order_id, NULL, v_user_id,
    'order_status_changed',
    v_order.status, p_new_status,
    p_note,
    jsonb_build_object(
      'ip',          v_ip,
      'user_agent',  v_user_agent,
      'changed_by',  v_user_id,
      'changed_at',  now()
    )
  );

  RETURN jsonb_build_object(
    'ok',          true,
    'from_status', v_order.status,
    'to_status',   p_new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.update_order_status IS
  'FASE 5: Máquina de estados con reglas de negocio + bitácora enriquecida (IP, user_agent).';

-- ─── 3. Notificación al técnico al ser asignado ───────────────────────────────
-- La RPC assign_order existente actualiza assigned_to.
-- Agregamos un trigger para crear la notificación automáticamente.

CREATE OR REPLACE FUNCTION public.trg_order_assigned_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_number text;
  v_title        text;
BEGIN
  -- Solo disparar si assigned_to cambió y hay un nuevo asignado
  IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL THEN
    v_order_number := NEW.order_number;
    v_title        := NEW.title;

    -- Notificación interna para el técnico asignado
    INSERT INTO public.notifications
      (workspace_id, user_id, title, message, type)
    VALUES (
      NEW.workspace_id,
      NEW.assigned_to,
      'Nueva asignación de trabajo',
      format('Se te asignó una nueva Orden de Trabajo: %s — %s', v_order_number, v_title),
      'info'
    );

    -- Bitácora de asignación
    INSERT INTO public.work_logs
      (order_id, work_order_id, user_id, event_type, note)
    VALUES (
      NEW.id, NULL, NEW.assigned_to,
      'order_assigned',
      format('Técnico asignado: %s', (SELECT full_name FROM public.profiles WHERE id = NEW.assigned_to))
    );
  END IF;

  -- Si se quitó la asignación
  IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NULL AND OLD.assigned_to IS NOT NULL THEN
    INSERT INTO public.work_logs
      (order_id, work_order_id, user_id, event_type, note)
    VALUES (
      NEW.id, NULL, auth.uid(),
      'order_unassigned',
      'Asignación de técnico removida'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_assigned_notify ON public.orders;
CREATE TRIGGER trg_order_assigned_notify
  AFTER UPDATE OF assigned_to ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_assigned_notify();

COMMENT ON FUNCTION public.trg_order_assigned_notify IS
  'FASE 5: Notifica al técnico cuando se le asigna un pedido. Zero Trust: workspace verificado.';

-- ─── 4. Índice para lookup de notificaciones por usuario ─────────────────────

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
