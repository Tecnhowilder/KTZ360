-- ============================================================
-- Migration 0106 — Flujo operativo extendido de Pedidos
-- Agrega: nuevos estados, fase de evidencias, assign_order RPC
-- Zero Trust: workspace_id siempre del JWT
-- RLS: todas las tablas ya tienen RLS habilitado
-- ============================================================

-- ─── 1. Extender estados de pedidos ──────────────────────────────────────────

-- Quitar constraint existente si la hay
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Agregar constraint con los nuevos estados  
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pendiente', 'asignado', 'programado',
    'en_ruta', 'en_sitio', 'en_ejecucion',
    'pausado', 'finalizado', 'facturado', 'cancelado'
  ));

-- ─── 2. Fase en evidencias (Antes / Durante / Después) ───────────────────────

ALTER TABLE evidence_files ADD COLUMN IF NOT EXISTS phase text DEFAULT NULL;

DO $$ BEGIN
  ALTER TABLE evidence_files ADD CONSTRAINT evidence_files_phase_check
    CHECK (phase IN ('antes', 'durante', 'despues'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger: auto-asignar fase según estado del pedido en el momento de subida
CREATE OR REPLACE FUNCTION public._set_evidence_phase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_status text;
BEGIN
  IF NEW.order_id IS NOT NULL AND NEW.phase IS NULL THEN
    SELECT status INTO v_order_status
    FROM orders
    WHERE id = NEW.order_id;

    NEW.phase := CASE
      WHEN v_order_status IN ('pendiente', 'asignado', 'programado') THEN 'antes'
      WHEN v_order_status IN ('finalizado', 'facturado')             THEN 'despues'
      ELSE 'durante'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evidence_phase ON evidence_files;
CREATE TRIGGER trg_evidence_phase
  BEFORE INSERT ON evidence_files
  FOR EACH ROW EXECUTE FUNCTION public._set_evidence_phase();

-- ─── 3. RPC assign_order ─────────────────────────────────────────────────────
-- FIX: la función existente tiene p_assigned_to DEFAULT NULL.
-- CREATE OR REPLACE no puede quitar un DEFAULT → hay que hacer DROP primero.

DROP FUNCTION IF EXISTS public.assign_order(uuid, uuid);

CREATE OR REPLACE FUNCTION public.assign_order(
  p_order_id    uuid,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_caller_id    uuid;
  v_caller_role  text;
BEGIN
  v_caller_id := auth.uid();

  SELECT workspace_id, role
    INTO v_workspace_id, v_caller_role
    FROM profiles
   WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para asignar pedidos');
  END IF;

  -- Verificar que el pedido pertenece al workspace
  IF NOT EXISTS (
    SELECT 1 FROM orders
     WHERE id = p_order_id AND workspace_id = v_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Verificar que el técnico pertenece al mismo workspace
  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = p_assigned_to AND workspace_id = v_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Técnico no pertenece a este workspace');
  END IF;

  -- Asignar técnico
  UPDATE orders
     SET assigned_to = p_assigned_to,
         updated_at  = now()
   WHERE id = p_order_id AND workspace_id = v_workspace_id;

  -- Log automático en bitácora
  INSERT INTO work_logs (
    workspace_id, order_id, user_id, event_type, note, metadata
  ) VALUES (
    v_workspace_id, p_order_id, v_caller_id, 'order_assigned', NULL,
    jsonb_build_object('assigned_to', p_assigned_to)
  );

  -- Si el pedido estaba pendiente, avanzar a asignado
  UPDATE orders
     SET status     = 'asignado',
         updated_at = now()
   WHERE id          = p_order_id
     AND workspace_id = v_workspace_id
     AND status       = 'pendiente';

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_order(uuid, uuid) TO authenticated;

-- ─── 4. Actualizar RPC update_order_status con los nuevos estados ────────────

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id   uuid,
  p_new_status text,
  p_note       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_caller_id    uuid;
  v_caller_role  text;
  v_current      text;
  v_allowed      text[];
BEGIN
  v_caller_id := auth.uid();

  SELECT workspace_id, role
    INTO v_workspace_id, v_caller_role
    FROM profiles
   WHERE id = v_caller_id;

  -- Verificar pedido
  SELECT status INTO v_current
    FROM orders
   WHERE id = p_order_id AND workspace_id = v_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Transiciones permitidas
  v_allowed := CASE v_current
    WHEN 'pendiente'    THEN ARRAY['asignado','programado','cancelado']
    WHEN 'asignado'     THEN ARRAY['programado','cancelado']
    WHEN 'programado'   THEN ARRAY['en_ruta','en_ejecucion','cancelado']
    WHEN 'en_ruta'      THEN ARRAY['en_sitio','cancelado']
    WHEN 'en_sitio'     THEN ARRAY['en_ejecucion','cancelado']
    WHEN 'en_ejecucion' THEN ARRAY['pausado','finalizado','cancelado']
    WHEN 'pausado'      THEN ARRAY['en_ejecucion','cancelado']
    WHEN 'finalizado'   THEN ARRAY['facturado']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('Transición no permitida: %s → %s', v_current, p_new_status)
    );
  END IF;

  -- Actualizar estado
  UPDATE orders
     SET status     = p_new_status,
         updated_at = now(),
         started_at  = CASE WHEN p_new_status = 'en_ejecucion' AND started_at IS NULL
                            THEN now() ELSE started_at END,
         finished_at = CASE WHEN p_new_status IN ('finalizado','facturado')
                            THEN now() ELSE finished_at END
   WHERE id = p_order_id AND workspace_id = v_workspace_id;

  -- Log automático
  INSERT INTO work_logs (
    workspace_id, order_id, user_id, event_type,
    from_status, to_status, note, metadata
  ) VALUES (
    v_workspace_id, p_order_id, v_caller_id, 'order_status_changed',
    v_current, p_new_status, p_note, '{}'::jsonb
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, text, text) TO authenticated;

-- ─── 5. RPC get_order: incluir assigned_name en la respuesta ─────────────────

CREATE OR REPLACE FUNCTION public.get_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_caller_id    uuid;
  v_order        jsonb;
  v_wos          jsonb;
  v_logs         jsonb;
BEGIN
  v_caller_id := auth.uid();

  SELECT workspace_id INTO v_workspace_id
    FROM profiles WHERE id = v_caller_id;

  -- Pedido con nombre de técnico asignado y cliente
  SELECT to_jsonb(o) ||
    jsonb_build_object(
      'assigned_name',
        (SELECT full_name FROM profiles WHERE id = o.assigned_to),
      'client_name',
        (SELECT name FROM clients WHERE id = o.client_id)
    )
    INTO v_order
    FROM orders o
   WHERE o.id = p_order_id AND o.workspace_id = v_workspace_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Órdenes de trabajo
  SELECT COALESCE(jsonb_agg(
    to_jsonb(w) ||
    jsonb_build_object(
      'assigned_name', (SELECT full_name FROM profiles WHERE id = w.assigned_to)
    )
    ORDER BY w.sequence_num NULLS LAST, w.created_at
  ), '[]'::jsonb)
  INTO v_wos
  FROM work_orders w
  WHERE w.order_id = p_order_id AND w.workspace_id = v_workspace_id;

  -- Bitácora
  SELECT COALESCE(jsonb_agg(
    to_jsonb(l) ||
    jsonb_build_object('user_name', (SELECT full_name FROM profiles WHERE id = l.user_id))
    ORDER BY l.created_at DESC
  ), '[]'::jsonb)
  INTO v_logs
  FROM work_logs l
  WHERE l.order_id = p_order_id AND l.workspace_id = v_workspace_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'order',       v_order,
    'work_orders', v_wos,
    'logs',        v_logs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order(uuid) TO authenticated;
