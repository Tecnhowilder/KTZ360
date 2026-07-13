-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0136: security_hardening_audit — Correcciones Auditoría Round 3
-- ════════════════════════════════════════════════════════════════════════════
-- Hallazgos corregidos:
--   N-001 (CRÍTICO)  portal_rate_limit: policy FOR ALL sin TO clause — anon
--                    podía escribir porque auth.uid() IS NULL es true para anon.
--   C-003 (CRÍTICO)  order_access_tokens: USING(true) para anon exponía todos
--                    los tokens via REST. order_events: WITH CHECK(true) para
--                    anon insertaba eventos sin validación de token.
--   C-002 (LIMPIEZA) notifications_insert_workspace: dead code OR auth.uid() IS NULL
--                    nunca puede ser true en contexto TO authenticated.
--   I-003 (MEJORA)   attendance_records: policy FOR ALL permitía insertar/modificar
--                    registros de asistencia de otros usuarios del workspace.
--   M-004 (MEJORA)   get_public_order: row_to_json(v_order) exponía workspace_id,
--                    client_id, created_by, assigned_to, quote_id, deleted_at.
--   I-006 (MEJORA)   list_orders: 7 LIKE sin ESCAPE — metacaracteres % y _ sin sanitizar.
--
-- Principio aplicado en N-001 y C-003:
--   Las funciones SECURITY DEFINER (check_portal_rate_limit, get_public_order,
--   register_order_event) corren como postgres → bypass RLS automático.
--   Nunca necesitaron policies permisivas en tabla. Eliminar las policies
--   expuestas deja DEFAULT DENY para todos los roles directos.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── N-001: Eliminar policy que permitía escritura anon en portal_rate_limit ──
-- Evidencia del bug:
--   CREATE POLICY "rpc inserts portal_rate_limit" ON public.portal_rate_limit
--     FOR ALL WITH CHECK (auth.uid() IS NULL);
--   → Sin TO clause → aplica a anon. Para anon: auth.uid() IS NULL = TRUE.
--   → Anon podía SELECT/INSERT/UPDATE/DELETE todas las filas — bypaseaba rate limit.
-- Fix: DROP la policy. SECURITY DEFINER bypass RLS, no necesita policy de tabla.

DROP POLICY IF EXISTS "rpc inserts portal_rate_limit" ON public.portal_rate_limit;


-- ─── C-003: Eliminar policies de acceso directo anon en portal público ─────────
-- order_access_tokens: USING(true) para anon exponía TODOS los tokens a
-- cualquier usuario anon via GET /rest/v1/order_access_tokens sin restricción.
-- get_public_order() es SECURITY DEFINER → lee tokens sin necesitar esta policy.

DROP POLICY IF EXISTS "anon read order token by token" ON public.order_access_tokens;

-- order_events: WITH CHECK(true) para anon permitía insertar cualquier evento
-- para cualquier pedido sin validación del token de acceso.
-- register_order_event() es SECURITY DEFINER y valida el token → no necesita
-- acceso directo a la tabla.

DROP POLICY IF EXISTS "anon insert order events" ON public.order_events;


-- ─── C-002: Limpiar dead code en notifications_insert_workspace ───────────────
-- La condición OR auth.uid() IS NULL es código muerto en contexto TO authenticated:
-- el role authenticated garantiza que auth.uid() siempre devuelve un UUID.
-- La condición nunca puede ser TRUE → confunde sin proteger.

DROP POLICY IF EXISTS "notifications_insert_workspace" ON public.notifications;

CREATE POLICY "notifications_insert_workspace"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id = public.current_workspace_id()
    AND user_id  = auth.uid()
  );


-- ─── I-003: Separar policies de attendance_records por operación ──────────────
-- La policy "workspace_isolation" FOR ALL USING(workspace_id=current_workspace_id())
-- aplicaba la misma condición a SELECT, INSERT, UPDATE y DELETE.
-- Para INSERT: WITH CHECK implícito era solo workspace_id — cualquier miembro
-- podía insertar registros de asistencia para OTROS usuarios del workspace.
-- Fix: SELECT libre en workspace; INSERT/UPDATE restringen a user_id = auth.uid().
-- SECURITY DEFINER RPCs (ej. close_attendance_record) siguen con bypass RLS.

DROP POLICY IF EXISTS "workspace_isolation" ON public.attendance_records;

CREATE POLICY "attendance_select_workspace"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (workspace_id = public.current_workspace_id());

CREATE POLICY "attendance_insert_own"
  ON public.attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id = public.current_workspace_id()
    AND user_id  = auth.uid()
  );

CREATE POLICY "attendance_update_own"
  ON public.attendance_records FOR UPDATE
  TO authenticated
  USING  (workspace_id = public.current_workspace_id() AND user_id = auth.uid())
  WITH CHECK (workspace_id = public.current_workspace_id() AND user_id = auth.uid());

-- DELETE: sin policy → DEFAULT DENY para authenticated. Usar RPC admin si se requiere.


-- ─── M-004: get_public_order — campos explícitos en lugar de row_to_json ──────
-- row_to_json(v_order) exponía al portal público anónimo:
--   workspace_id (UUID interno), client_id (UUID interno), created_by (UUID interno),
--   assigned_to (UUID interno), quote_id (UUID interno), deleted_at (soft-delete flag).
-- Fix: jsonb_build_object con solo los campos necesarios para la vista del cliente.

CREATE OR REPLACE FUNCTION public.get_public_order(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_row  RECORD;
  v_order      RECORD;
  v_client     RECORD;
  v_company    RECORD;
BEGIN
  SELECT order_id, workspace_id INTO v_token_row
    FROM public.order_access_tokens
   WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalid');
  END IF;

  SELECT o.id, o.order_number, o.title, o.description, o.status,
         o.order_snapshot, o.total_amount, o.scheduled_at, o.started_at,
         o.finished_at, o.notes, o.created_at, o.client_id
    INTO v_order
    FROM public.orders o
   WHERE o.id = v_token_row.order_id AND o.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  IF v_order.client_id IS NOT NULL THEN
    SELECT id, name, phone, email, city INTO v_client
      FROM public.clients
     WHERE id = v_order.client_id;
  END IF;

  SELECT name, nit, phone, email, city, logo_path INTO v_company
    FROM public.company_settings
   WHERE workspace_id = v_token_row.workspace_id;

  INSERT INTO public.order_events (workspace_id, order_id, event_type)
  VALUES (v_token_row.workspace_id, v_token_row.order_id, 'order_viewed')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok',      true,
    'order',   jsonb_build_object(
      'id',             v_order.id,
      'order_number',   v_order.order_number,
      'title',          v_order.title,
      'description',    v_order.description,
      'status',         v_order.status,
      'order_snapshot', v_order.order_snapshot,
      'total_amount',   v_order.total_amount,
      'scheduled_at',   v_order.scheduled_at,
      'started_at',     v_order.started_at,
      'finished_at',    v_order.finished_at,
      'notes',          v_order.notes,
      'created_at',     v_order.created_at
    ),
    'client',  CASE WHEN v_client.id IS NOT NULL THEN row_to_json(v_client) ELSE NULL END,
    'company', row_to_json(v_company),
    'token',   p_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_order(uuid) TO anon, authenticated;


-- ─── I-006: Escapar metacaracteres LIKE en list_orders ────────────────────────
-- 7 comparaciones LIKE '%' || v_search_lower || '%' sin cláusula ESCAPE.
-- Un usuario podía enviar % o _ en el término de búsqueda causando matches
-- inesperados o carga adicional en la DB.
-- Fix: escapar \ → \\, % → \%, _ → \_ antes de usar en LIKE ... ESCAPE '\'.

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
  v_search_esc   text;
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
  -- Escapar metacaracteres LIKE: \ primero para no re-escapar las sustituciones
  v_search_esc   := replace(replace(replace(v_search_lower, '\', '\\'), '%', '\%'), '_', '\_');

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
  LEFT JOIN public.clients  c    ON c.id   = o.client_id
  LEFT JOIN public.profiles p_a  ON p_a.id = o.assigned_to
  LEFT JOIN public.profiles p_c  ON p_c.id = o.created_by
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
    AND (
      v_user_role IN ('owner', 'admin', 'supervisor', 'comercial', 'super_admin', 'support_admin')
      OR o.assigned_to = v_user_id
    )
    AND (
      v_search_esc = ''
      OR LOWER(o.order_number)              LIKE '%' || v_search_esc || '%' ESCAPE '\'
      OR LOWER(o.title)                     LIKE '%' || v_search_esc || '%' ESCAPE '\'
      OR LOWER(COALESCE(c.name,        '')) LIKE '%' || v_search_esc || '%' ESCAPE '\'
      OR LOWER(COALESCE(c.phone,       '')) LIKE '%' || v_search_esc || '%' ESCAPE '\'
      OR LOWER(COALESCE(c.email,       '')) LIKE '%' || v_search_esc || '%' ESCAPE '\'
      OR LOWER(COALESCE(p_a.full_name, '')) LIKE '%' || v_search_esc || '%' ESCAPE '\'
      OR LOWER(COALESCE(o.status,      '')) LIKE '%' || v_search_esc || '%' ESCAPE '\'
    );

  RETURN jsonb_build_object('ok', true, 'orders', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_orders(text, text) TO authenticated;

COMMENT ON FUNCTION public.list_orders IS
  '0136: Metacaracteres LIKE escapados (\ % _). '
  '0125: Filtrado por rol — operario ve solo sus pedidos asignados. Supervisor/admin/owner ven todos.';
