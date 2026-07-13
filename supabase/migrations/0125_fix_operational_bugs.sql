-- ============================================================================
-- 0125 — fix_operational_bugs: Corrección de bugs críticos módulo operativo
-- ============================================================================
-- CAMBIOS:
--   1. Eliminar trigger roto trg_order_assigned_notify (0105):
--      - Missing workspace_id en INSERT work_logs → NOT NULL violation
--      - auth.uid() en contexto de trigger retorna NULL → user_id NULL violation
--      → Toda asignación de técnico a pedido fallaba silenciosamente
--
--   2. Reemplazar trigger con versión correcta que solo inserta notificación
--      (la bitácora ya la escribe assign_order RPC, no hace falta duplicar)
--
--   3. Filtrado por rol en list_orders: operarios ven SOLO sus pedidos asignados
--
--   4. Filtrado por rol en list_work_orders: operarios ven SOLO sus OTs asignadas
--
--   5. Pausa / Reanudación en gps_events: agregar event_types 'pausa' y 'reanudacion'
--      + RPCs record_pausa / record_reanudacion
--
--   6. Tracking automático: RPC update_location_if_active (llama el frontend
--      via setInterval mientras hay OT activa — sin watchPosition)
--
-- Zero Trust: workspace_id siempre del JWT, nunca del cliente.
-- ============================================================================


-- ─── 1. ELIMINAR TRIGGER ROTO (0105) ─────────────────────────────────────────
-- El trigger trg_order_assigned_notify insertaba en work_logs sin workspace_id
-- y usaba auth.uid() en contexto de trigger (devuelve NULL).
-- Esto rompía TODA asignación de técnico a pedido.

DROP TRIGGER IF EXISTS trg_order_assigned_notify ON public.orders;
DROP FUNCTION IF EXISTS public.trg_order_assigned_notify();

-- ─── 2. NUEVO TRIGGER DE NOTIFICACIÓN (SOLO notificaciones, sin work_logs) ────
-- La bitácora ya la escribe assign_order RPC. Este trigger solo notifica.

CREATE OR REPLACE FUNCTION public._order_assignment_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Técnico asignado o cambiado
  IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
    VALUES (
      NEW.workspace_id,
      NEW.assigned_to,
      'Nuevo pedido asignado',
      'Se te asignó el pedido ' || NEW.order_number || ': ' || NEW.title,
      'info'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Técnico removido
  IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
     AND OLD.assigned_to IS NOT NULL
     AND NEW.assigned_to IS NULL THEN
    INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
    VALUES (
      NEW.workspace_id,
      OLD.assigned_to,
      'Asignación removida',
      'Ya no estás asignado al pedido ' || NEW.order_number,
      'info'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_assignment_notify ON public.orders;
CREATE TRIGGER trg_order_assignment_notify
  AFTER UPDATE OF assigned_to ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public._order_assignment_notify();

COMMENT ON FUNCTION public._order_assignment_notify IS
  '0125: Notifica al técnico cuando se le asigna/desasigna un pedido. Sin work_logs (la bitácora la escribe assign_order RPC).';


-- ─── 3. list_orders: filtrar por rol ─────────────────────────────────────────
-- Operario ve solo pedidos donde está assigned_to o created_by.
-- Todos los demás roles ven todo el workspace.

DROP FUNCTION IF EXISTS public.list_orders(text, text);

CREATE OR REPLACE FUNCTION public.list_orders(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_user_role    text;
  v_result       jsonb;
  v_search_lower text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT workspace_id, role
    INTO v_workspace_id, v_user_role
    FROM public.profiles
   WHERE id = v_user_id;

  IF NOT public.check_feature_access(v_workspace_id, 'orders_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'orders_not_included');
  END IF;

  v_search_lower := LOWER(TRIM(COALESCE(p_search, '')));

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',            o.id,
      'order_number',  o.order_number,
      'title',         o.title,
      'description',   o.description,
      'status',        o.status,
      'source',        o.source,
      'total_amount',  o.total_amount,
      'scheduled_at',  o.scheduled_at,
      'started_at',    o.started_at,
      'finished_at',   o.finished_at,
      'created_at',    o.created_at,
      'updated_at',    o.updated_at,
      'quote_id',      o.quote_id,
      'client_id',     o.client_id,
      'client_name',   c.name,
      'client_phone',  c.phone,
      'client_email',  c.email,
      'assigned_to',   o.assigned_to,
      'assigned_name', p_a.full_name,
      'created_by',    o.created_by,
      'creator_name',  p_c.full_name,
      'work_order_count', COALESCE(wo_stats.total, 0),
      'work_orders_done', COALESCE(wo_stats.done, 0)
    ) ORDER BY o.created_at DESC
  ) INTO v_result
  FROM public.orders o
  LEFT JOIN public.clients c      ON c.id = o.client_id
  LEFT JOIN public.profiles p_a   ON p_a.id = o.assigned_to
  LEFT JOIN public.profiles p_c   ON p_c.id = o.created_by
  LEFT JOIN (
    SELECT
      order_id,
      COUNT(*)::int                                        AS total,
      COUNT(*) FILTER (WHERE status = 'finalizada')::int  AS done
    FROM public.work_orders
    GROUP BY order_id
  ) wo_stats ON wo_stats.order_id = o.id
  WHERE o.workspace_id = v_workspace_id
    AND o.deleted_at   IS NULL
    AND (p_status IS NULL OR o.status = p_status)
    -- ZERO TRUST: operario ve solo lo asignado. Otros roles ven todo.
    AND (
      v_user_role IN ('owner', 'admin', 'supervisor', 'comercial', 'super_admin', 'support_admin')
      OR o.assigned_to = v_user_id
    )
    AND (
      v_search_lower = ''
      OR LOWER(o.order_number)              LIKE '%' || v_search_lower || '%'
      OR LOWER(o.title)                     LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(c.name, ''))        LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(c.phone, ''))       LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(c.email, ''))       LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(p_a.full_name, '')) LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(o.status, ''))      LIKE '%' || v_search_lower || '%'
    );

  RETURN jsonb_build_object('ok', true, 'orders', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_orders(text, text) TO authenticated;

COMMENT ON FUNCTION public.list_orders IS
  '0125: Filtrado por rol — operario ve solo sus pedidos asignados. Supervisor/admin/owner ven todos.';


-- ─── 4. list_work_orders: filtrar por rol ────────────────────────────────────
-- Operario ve solo OTs donde está assigned_to.

DROP FUNCTION IF EXISTS public.list_work_orders(uuid, text, text);

CREATE OR REPLACE FUNCTION public.list_work_orders(
  p_order_id uuid  DEFAULT NULL,
  p_status   text  DEFAULT NULL,
  p_priority text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_user_role    text;
  v_result       jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT workspace_id, role
    INTO v_workspace_id, v_user_role
    FROM public.profiles
   WHERE id = v_user_id;

  IF NOT public.check_feature_access(v_workspace_id, 'work_orders_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'work_orders_not_included');
  END IF;

  -- Validar que el pedido pertenece al workspace (si se proporciona)
  IF p_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND workspace_id = v_workspace_id AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pedido no encontrado');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                wo.id,
      'work_order_number', wo.work_order_number,
      'order_id',          wo.order_id,
      'order_number',      o.order_number,
      'order_title',       o.title,
      'title',             wo.title,
      'description',       wo.description,
      'status',            wo.status,
      'priority',          wo.priority,
      'sequence_num',      wo.sequence_num,
      'assigned_to',       wo.assigned_to,
      'assigned_name',     p.full_name,
      'scheduled_at',      wo.scheduled_at,
      'started_at',        wo.started_at,
      'finished_at',       wo.finished_at,
      'created_at',        wo.created_at,
      'client_name',       c.name
    ) ORDER BY wo.created_at DESC
  ) INTO v_result
  FROM public.work_orders wo
  JOIN  public.orders   o    ON o.id  = wo.order_id AND o.deleted_at IS NULL
  LEFT JOIN public.clients  c    ON c.id  = o.client_id
  LEFT JOIN public.profiles p    ON p.id  = wo.assigned_to
  WHERE wo.workspace_id = v_workspace_id
    AND (p_order_id IS NULL OR wo.order_id  = p_order_id)
    AND (p_status   IS NULL OR wo.status    = p_status)
    AND (p_priority IS NULL OR wo.priority  = p_priority)
    -- ZERO TRUST: operario ve solo sus OTs
    AND (
      v_user_role IN ('owner', 'admin', 'supervisor', 'comercial', 'super_admin', 'support_admin')
      OR wo.assigned_to = v_user_id
    );

  RETURN jsonb_build_object('ok', true, 'work_orders', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_work_orders(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.list_work_orders IS
  '0125: Filtrado por rol — operario ve solo sus OTs asignadas. Supervisor/admin/owner ven todas.';


-- ─── 5. Pausa y Reanudación GPS ───────────────────────────────────────────────
-- Agregar event_types pausa/reanudacion a gps_events para marcaciones
-- (no confundir con almuerzo en attendance_records — estos son eventos GPS)

-- Extender constraint gps_events.event_type
ALTER TABLE public.gps_events
  DROP CONSTRAINT IF EXISTS gps_events_event_type_check;

ALTER TABLE public.gps_events
  ADD CONSTRAINT gps_events_event_type_check
  CHECK (event_type IN (
    'check_in', 'check_out', 'status_change', 'manual_update', 'pausa', 'reanudacion'
  ));

-- Extender estados operativos (agregar 'en_pausa' al estado del perfil)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_operational_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_operational_status_check
  CHECK (operational_status IN (
    'off', 'disponible', 'en_ruta', 'en_sitio', 'finalizado', 'en_pausa'
  ));

-- RPC: record_pausa — registra pausa de trabajo (requiere estar en en_sitio o en_ruta)
CREATE OR REPLACE FUNCTION public.record_pausa(
  p_latitude      numeric  DEFAULT NULL,
  p_longitude     numeric  DEFAULT NULL,
  p_accuracy      numeric  DEFAULT NULL,
  p_order_id      uuid     DEFAULT NULL,
  p_work_order_id uuid     DEFAULT NULL,
  p_motivo        text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_ws_id    uuid;
  v_consent  timestamptz;
  v_status   text;
  v_event_id uuid;
  v_coord_ok jsonb;
BEGIN
  SELECT workspace_id, gps_consent_at, operational_status
    INTO v_ws_id, v_consent, v_status
    FROM public.profiles
   WHERE id = v_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil no encontrado');
  END IF;

  IF NOT public.check_feature_access(v_ws_id, 'gps_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GPS requiere plan PREMIUM');
  END IF;

  IF v_consent IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consent_required');
  END IF;

  -- Validar coordenadas si se proporcionan
  IF p_latitude IS NOT NULL THEN
    v_coord_ok := public.validate_gps_coords(p_latitude, p_longitude, p_accuracy);
    IF NOT (v_coord_ok->>'ok')::boolean THEN
      RETURN jsonb_build_object('ok', false, 'error', v_coord_ok->>'error');
    END IF;
  END IF;

  -- Registrar evento de pausa
  INSERT INTO public.gps_events
    (workspace_id, user_id, event_type, latitude, longitude, accuracy_meters,
     operational_status, order_id, work_order_id, metadata)
  VALUES
    (v_ws_id, v_user_id, 'pausa', p_latitude, p_longitude, p_accuracy,
     'en_pausa', p_order_id, p_work_order_id,
     jsonb_build_object('motivo', p_motivo))
  RETURNING id INTO v_event_id;

  -- Actualizar estado operativo
  UPDATE public.profiles
     SET operational_status = 'en_pausa', updated_at = now()
   WHERE id = v_user_id;

  -- Actualizar ubicación si se proporcionan coordenadas
  IF p_latitude IS NOT NULL THEN
    INSERT INTO public.member_locations
      (workspace_id, user_id, latitude, longitude, accuracy_meters, source, order_id, work_order_id)
    VALUES
      (v_ws_id, v_user_id, p_latitude, p_longitude, p_accuracy,
       'status_change', p_order_id, p_work_order_id)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
      latitude        = excluded.latitude,
      longitude       = excluded.longitude,
      accuracy_meters = excluded.accuracy_meters,
      source          = 'status_change',
      order_id        = excluded.order_id,
      work_order_id   = excluded.work_order_id,
      recorded_at     = now();
  END IF;

  -- Bitácora OT
  IF p_work_order_id IS NOT NULL THEN
    INSERT INTO public.work_logs
      (workspace_id, order_id, work_order_id, user_id, event_type, note, metadata)
    VALUES (
      v_ws_id, p_order_id, p_work_order_id, v_user_id,
      'work_order_status_changed',
      COALESCE('Pausa: ' || p_motivo, 'Pausa registrada'),
      jsonb_build_object('gps_event_id', v_event_id, 'type', 'pausa')
    );
  END IF;

  -- Notificar supervisores
  INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
  SELECT v_ws_id, p.id,
    '⏸ Pausa',
    (SELECT full_name FROM public.profiles WHERE id = v_user_id)
      || ' pausó su trabajo' || COALESCE(' — ' || p_motivo, ''),
    'info'
  FROM public.profiles p
  WHERE p.workspace_id = v_ws_id
    AND p.role IN ('owner', 'admin', 'supervisor')
    AND p.status = 'active'
    AND p.id != v_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'event_type', 'pausa',
    'operational_status', 'en_pausa',
    'gps_event_id', v_event_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_pausa(numeric, numeric, numeric, uuid, uuid, text) TO authenticated;


-- RPC: record_reanudacion — reanuda trabajo desde pausa
CREATE OR REPLACE FUNCTION public.record_reanudacion(
  p_latitude      numeric  DEFAULT NULL,
  p_longitude     numeric  DEFAULT NULL,
  p_accuracy      numeric  DEFAULT NULL,
  p_order_id      uuid     DEFAULT NULL,
  p_work_order_id uuid     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_ws_id    uuid;
  v_consent  timestamptz;
  v_event_id uuid;
  v_coord_ok jsonb;
BEGIN
  SELECT workspace_id, gps_consent_at
    INTO v_ws_id, v_consent
    FROM public.profiles
   WHERE id = v_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil no encontrado');
  END IF;

  IF NOT public.check_feature_access(v_ws_id, 'gps_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'GPS requiere plan PREMIUM');
  END IF;

  IF v_consent IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consent_required');
  END IF;

  IF p_latitude IS NOT NULL THEN
    v_coord_ok := public.validate_gps_coords(p_latitude, p_longitude, p_accuracy);
    IF NOT (v_coord_ok->>'ok')::boolean THEN
      RETURN jsonb_build_object('ok', false, 'error', v_coord_ok->>'error');
    END IF;
  END IF;

  -- Registrar reanudación
  INSERT INTO public.gps_events
    (workspace_id, user_id, event_type, latitude, longitude, accuracy_meters,
     operational_status, order_id, work_order_id)
  VALUES
    (v_ws_id, v_user_id, 'reanudacion', p_latitude, p_longitude, p_accuracy,
     'en_sitio', p_order_id, p_work_order_id)
  RETURNING id INTO v_event_id;

  -- Volver a en_sitio
  UPDATE public.profiles
     SET operational_status = 'en_sitio', updated_at = now()
   WHERE id = v_user_id;

  IF p_latitude IS NOT NULL THEN
    INSERT INTO public.member_locations
      (workspace_id, user_id, latitude, longitude, accuracy_meters, source, order_id, work_order_id)
    VALUES
      (v_ws_id, v_user_id, p_latitude, p_longitude, p_accuracy,
       'status_change', p_order_id, p_work_order_id)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
      latitude        = excluded.latitude,
      longitude       = excluded.longitude,
      accuracy_meters = excluded.accuracy_meters,
      source          = 'status_change',
      order_id        = excluded.order_id,
      work_order_id   = excluded.work_order_id,
      recorded_at     = now();
  END IF;

  IF p_work_order_id IS NOT NULL THEN
    INSERT INTO public.work_logs
      (workspace_id, order_id, work_order_id, user_id, event_type, note, metadata)
    VALUES (
      v_ws_id, p_order_id, p_work_order_id, v_user_id,
      'work_order_status_changed',
      'Trabajo reanudado',
      jsonb_build_object('gps_event_id', v_event_id, 'type', 'reanudacion')
    );
  END IF;

  -- Notificar supervisores
  INSERT INTO public.notifications (workspace_id, user_id, title, message, type)
  SELECT v_ws_id, p.id,
    '▶ Reanudó trabajo',
    (SELECT full_name FROM public.profiles WHERE id = v_user_id) || ' reanudó su trabajo',
    'info'
  FROM public.profiles p
  WHERE p.workspace_id = v_ws_id
    AND p.role IN ('owner', 'admin', 'supervisor')
    AND p.status = 'active'
    AND p.id != v_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'event_type', 'reanudacion',
    'operational_status', 'en_sitio',
    'gps_event_id', v_event_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_reanudacion(numeric, numeric, numeric, uuid, uuid) TO authenticated;


-- ─── 6. RPC update_location_if_active ────────────────────────────────────────
-- El frontend llama esto cada N minutos SI hay una OT activa asignada.
-- Sin watchPosition — protege la batería.

CREATE OR REPLACE FUNCTION public.update_location_if_active(
  p_latitude  numeric,
  p_longitude numeric,
  p_accuracy  numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_ws_id    uuid;
  v_consent  timestamptz;
  v_coord_ok jsonb;
  v_has_active_ot boolean;
BEGIN
  SELECT workspace_id, gps_consent_at
    INTO v_ws_id, v_consent
    FROM public.profiles
   WHERE id = v_user_id AND status = 'active';

  IF NOT FOUND OR v_consent IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consent_required');
  END IF;

  IF NOT public.check_feature_access(v_ws_id, 'gps_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'no_feature');
  END IF;

  v_coord_ok := public.validate_gps_coords(p_latitude, p_longitude, p_accuracy);
  IF NOT (v_coord_ok->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', v_coord_ok->>'error');
  END IF;

  -- Solo actualiza si hay OT activa asignada
  SELECT EXISTS (
    SELECT 1 FROM public.work_orders
    WHERE assigned_to = v_user_id
      AND workspace_id = v_ws_id
      AND status IN ('asignada', 'en_progreso')
  ) INTO v_has_active_ot;

  IF NOT v_has_active_ot THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'no_active_ot');
  END IF;

  -- UPSERT última ubicación (sin histórico = no llena gps_events)
  INSERT INTO public.member_locations
    (workspace_id, user_id, latitude, longitude, accuracy_meters, source)
  VALUES
    (v_ws_id, v_user_id, p_latitude, p_longitude, p_accuracy, 'manual')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET
    latitude        = excluded.latitude,
    longitude       = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    source          = 'manual',
    recorded_at     = now();

  RETURN jsonb_build_object('ok', true, 'updated', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_location_if_active(numeric, numeric, numeric) TO authenticated;

COMMENT ON FUNCTION public.update_location_if_active IS
  '0125: Actualiza ubicación SOLO si el usuario tiene OT activa asignada. Sin watchPosition. Optimiza batería.';


-- ─── 7. RLS ajuste orders: operario solo puede ver sus pedidos ────────────────
-- La política RLS actual permite a cualquier miembro leer todos los pedidos.
-- Complementamos con una política más restrictiva para operarios.
-- (Los RPCs list_orders/get_order ya tienen el filtro; esto cierra la brecha
--  si alguien consulta la tabla directamente.)

DROP POLICY IF EXISTS "members select orders" ON public.orders;

CREATE POLICY "members select orders"
  ON public.orders
  FOR SELECT
  USING (
    workspace_id = public.current_workspace_id()
    AND deleted_at IS NULL
    AND (
      -- Owner/admin/supervisor/comercial: ven todos los pedidos del workspace
      public.current_user_role() IN ('owner', 'admin', 'supervisor', 'comercial', 'super_admin', 'support_admin')
      -- Operario: solo los pedidos donde está asignado
      OR assigned_to = auth.uid()
      OR created_by  = auth.uid()
    )
  );


-- ─── 8. RLS ajuste work_orders: operario solo ve sus OTs ─────────────────────

DROP POLICY IF EXISTS "members select work_orders" ON public.work_orders;

CREATE POLICY "members select work_orders"
  ON public.work_orders
  FOR SELECT
  USING (
    workspace_id = public.current_workspace_id()
    AND (
      public.current_user_role() IN ('owner', 'admin', 'supervisor', 'comercial', 'super_admin', 'support_admin')
      OR assigned_to = auth.uid()
      OR created_by  = auth.uid()
    )
  );


-- ─── 9. RLS ajuste evidence_files: operario solo ve evidencias de sus OTs ────

DROP POLICY IF EXISTS "members select evidence_files" ON public.evidence_files;

CREATE POLICY "members select evidence_files"
  ON public.evidence_files
  FOR SELECT
  USING (
    workspace_id = public.current_workspace_id()
    AND deleted_at IS NULL
    AND (
      public.current_user_role() IN ('owner', 'admin', 'supervisor', 'comercial', 'super_admin', 'support_admin')
      OR uploaded_by = auth.uid()
      -- Operario puede ver evidencias de pedidos/OTs donde está asignado
      OR (
        order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = order_id AND o.assigned_to = auth.uid()
        )
      )
      OR (
        work_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.work_orders wo
          WHERE wo.id = work_order_id AND wo.assigned_to = auth.uid()
        )
      )
    )
  );


-- ─── Comentarios ─────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.record_pausa           IS '0125: Registra pausa de trabajo con GPS opcional. Notifica supervisores.';
COMMENT ON FUNCTION public.record_reanudacion     IS '0125: Reanuda trabajo desde pausa. Restaura estado en_sitio.';
COMMENT ON FUNCTION public.list_orders            IS '0125: list_orders con filtro por rol (operario = solo asignados). Reemplaza 0104.';
COMMENT ON FUNCTION public.list_work_orders       IS '0125: list_work_orders con filtro por rol (operario = solo asignados). Reemplaza 0051.';
