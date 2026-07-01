-- ============================================================
-- Migration 0111 — Pedidos: Production Ready (movido desde 0107)
-- Fixes identificados en auditoría de estabilización.
--
-- CAMBIOS:
--   1. Limpieza bulletproof de CHECK constraint en orders.status
--   2. Columna orders.source ('direct' | 'from_quote')
--   3. create_work_order hereda assigned_to del pedido padre
--   4. AssignTechSheet: RPC get_assignable_members (filtro correcto)
--   5. Notificaciones básicas para eventos críticos del pedido
--   6. system_configuration.resend placeholder (sin sobrescribir si existe)
--
-- Zero Trust: workspace_id siempre del JWT.
-- RLS: tablas existentes mantienen sus políticas.
-- ============================================================

-- ─── 1. CONSTRAINT FIX BULLETPROOF ───────────────────────────────────────────
-- Problema: inline CHECK en 0050 puede tener nombre auto-generado por Postgres
-- (e.g. "orders_status_check"). 0106 hace DROP IF EXISTS del mismo nombre,
-- pero si ya se aplicó 0106 el constraint puede llamarse diferente.
-- Solución: eliminar TODOS los CHECK constraints de orders y recrear.

DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pendiente', 'asignado', 'programado',
    'en_ruta', 'en_sitio', 'en_ejecucion',
    'pausado', 'finalizado', 'facturado', 'cancelado'
  ));

-- ─── 2. COLUMNA source EN orders ─────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'from_quote';

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_source_check
    CHECK (source IN ('direct', 'from_quote'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: detectar pedidos directos existentes por ausencia de quote_id
UPDATE public.orders
   SET source = 'direct'
 WHERE quote_id IS NULL
   AND source = 'from_quote';

-- Trigger: auto-asignar source en INSERT
CREATE OR REPLACE FUNCTION _set_order_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source IS NULL OR NEW.source = 'from_quote' THEN
    NEW.source := CASE WHEN NEW.quote_id IS NULL THEN 'direct' ELSE 'from_quote' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_source ON public.orders;
CREATE TRIGGER trg_order_source
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION _set_order_source();

-- ─── 3. create_work_order: heredar assigned_to del pedido padre ───────────────
-- Si no se especifica p_assigned_to, heredar el del pedido padre.

CREATE OR REPLACE FUNCTION public.create_work_order(
  p_order_id      uuid,
  p_title         text,
  p_description   text    DEFAULT NULL,
  p_priority      text    DEFAULT 'media',
  p_assigned_to   uuid    DEFAULT NULL,
  p_scheduled_at  timestamptz DEFAULT NULL,
  p_sequence_num  integer DEFAULT NULL,
  p_notes         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id   uuid;
  v_user_id        uuid;
  v_user_role      text;
  v_order          RECORD;
  v_work_order_id  uuid;
  v_seq            integer;
  v_assigned_final uuid;
BEGIN
  v_user_id := auth.uid();

  -- workspace_id del JWT (Zero Trust)
  SELECT workspace_id, role
    INTO v_workspace_id, v_user_role
    FROM profiles
   WHERE id = v_user_id;

  -- Solo roles con acceso operativo
  IF v_user_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para crear OTs');
  END IF;

  -- Verificar pedido
  SELECT * INTO v_order
    FROM public.orders
   WHERE id = p_order_id AND workspace_id = v_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Heredar assigned_to del pedido padre si no se especifica
  v_assigned_final := COALESCE(p_assigned_to, v_order.assigned_to);

  -- Si se especificó técnico, verificar que pertenece al workspace
  IF v_assigned_final IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = v_assigned_final AND workspace_id = v_workspace_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Técnico asignado no encontrado en el workspace');
    END IF;
  END IF;

  -- Siguiente sequence_num
  IF p_sequence_num IS NOT NULL THEN
    v_seq := p_sequence_num;
  ELSE
    SELECT COALESCE(MAX(sequence_num), 0) + 1
      INTO v_seq
      FROM public.work_orders
     WHERE order_id = p_order_id AND workspace_id = v_workspace_id;
  END IF;

  -- Insertar OT
  INSERT INTO public.work_orders (
    workspace_id, order_id, created_by, assigned_to,
    title, description, priority, sequence_num,
    scheduled_at, notes, status
  )
  VALUES (
    v_workspace_id, p_order_id, v_user_id, v_assigned_final,
    p_title, p_description,
    COALESCE(p_priority, 'media'),
    v_seq, p_scheduled_at, p_notes,
    CASE WHEN v_assigned_final IS NOT NULL THEN 'asignada' ELSE 'pendiente' END
  )
  RETURNING id INTO v_work_order_id;

  -- Log en bitácora
  INSERT INTO public.work_logs (
    workspace_id, order_id, work_order_id, user_id, event_type, metadata
  ) VALUES (
    v_workspace_id, p_order_id, v_work_order_id, v_user_id,
    'work_order_created',
    jsonb_build_object(
      'title',        p_title,
      'assigned_to',  v_assigned_final,
      'priority',     p_priority,
      'inherited_assignment', (p_assigned_to IS NULL AND v_order.assigned_to IS NOT NULL)
    )
  );

  RETURN jsonb_build_object('ok', true, 'work_order_id', v_work_order_id);
END;
$$;

-- ─── 4. RPC get_assignable_members ───────────────────────────────────────────
-- Devuelve únicamente miembros activos del workspace aptos para ser asignados.
-- Excluye: suspendidos, eliminados, super_admin, support_admin.

CREATE OR REPLACE FUNCTION public.get_assignable_members()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_caller_role  text;
  v_members      jsonb;
BEGIN
  SELECT workspace_id, role
    INTO v_workspace_id, v_caller_role
    FROM profiles
   WHERE id = auth.uid();

  IF v_caller_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                  p.id,
      'full_name',           p.full_name,
      'email',               p.email,
      'role',                p.role,
      'operational_status',  p.operational_status,
      'avatar_url',          p.avatar_url
    )
    ORDER BY p.full_name
  ), '[]'::jsonb)
  INTO v_members
  FROM profiles p
  WHERE p.workspace_id = v_workspace_id
    AND p.role IN ('admin', 'supervisor', 'comercial', 'operario')
    AND p.status = 'active'
    AND p.deleted_at IS NULL;

  RETURN jsonb_build_object('ok', true, 'members', v_members);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignable_members() TO authenticated;

-- ─── 5. NOTIFICACIONES DE PEDIDO ─────────────────────────────────────────────
-- Inserta notificación cuando un pedido es asignado al técnico.

CREATE OR REPLACE FUNCTION _notify_order_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo notificar cuando assigned_to cambia a un valor no nulo
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
    VALUES (
      NEW.workspace_id,
      NEW.assigned_to,
      'Nuevo pedido asignado',
      'Se te ha asignado el pedido ' || NEW.order_number || ': ' || NEW.title,
      'info'
    );
  END IF;

  -- Notificar al técnico cuando el estado cambia a en_ruta/en_sitio
  IF NEW.status IN ('en_ruta', 'en_sitio', 'en_ejecucion') AND OLD.status != NEW.status THEN
    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
      VALUES (
        NEW.workspace_id,
        NEW.assigned_to,
        'Estado actualizado: ' || NEW.order_number,
        'El pedido cambió a ' || NEW.status,
        'info'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_notifications ON public.orders;
CREATE TRIGGER trg_order_notifications
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION _notify_order_assigned();

-- ─── 6. system_configuration: placeholder para Resend ────────────────────────
-- No sobrescribe si ya existe. El operador debe configurar api_key manualmente.

INSERT INTO public.system_configuration (key, value)
VALUES (
  'resend',
  jsonb_build_object(
    'api_key',    '',
    'from_email', 'no-reply@shelwi.app',
    'from_name',  'Shelwi',
    'domain',     'shelwi.app'
  )
)
ON CONFLICT (key) DO NOTHING;

-- ─── 7. Actualizar assign_order: limpiar y reforzar ──────────────────────────
-- Reescritura limpia que no falla con el nuevo constraint.

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
  v_old_status   text;
BEGIN
  v_caller_id := auth.uid();

  SELECT workspace_id, role
    INTO v_workspace_id, v_caller_role
    FROM profiles
   WHERE id = v_caller_id;

  IF v_caller_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin permiso para asignar pedidos');
  END IF;

  -- Verificar pedido y obtener estado actual
  SELECT status INTO v_old_status
    FROM public.orders
   WHERE id = p_order_id AND workspace_id = v_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  -- Verificar que el técnico pertenece al workspace (si no es NULL)
  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = p_assigned_to
       AND workspace_id = v_workspace_id
       AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Técnico no disponible en este workspace');
  END IF;

  -- Actualizar asignación
  UPDATE public.orders
     SET assigned_to = p_assigned_to,
         updated_at  = now()
   WHERE id = p_order_id AND workspace_id = v_workspace_id;

  -- Si pedido en 'pendiente' y se asigna técnico → avanzar a 'asignado'
  IF p_assigned_to IS NOT NULL AND v_old_status = 'pendiente' THEN
    UPDATE public.orders
       SET status     = 'asignado',
           updated_at = now()
     WHERE id = p_order_id AND workspace_id = v_workspace_id;
  END IF;

  -- Log automático en bitácora
  INSERT INTO public.work_logs (
    workspace_id, order_id, user_id, event_type, metadata
  ) VALUES (
    v_workspace_id, p_order_id, v_caller_id, 'order_assigned',
    jsonb_build_object(
      'assigned_to',   p_assigned_to,
      'assigned_name', (SELECT full_name FROM profiles WHERE id = p_assigned_to),
      'by',            v_caller_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'assigned_to', p_assigned_to);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_order(uuid, uuid) TO authenticated;
