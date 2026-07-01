-- ============================================================================
-- 0104 — list_orders_search: Agregar búsqueda server-side a list_orders
-- ============================================================================
-- Sprint FASE 3: búsqueda incremental por número, cliente, técnico, estado.
-- Zero Trust: workspace_id del JWT, nunca del cliente.
-- Compatible con FASE 3: debounce 300ms en React Query.
--
-- FIX: DROP explícito de la firma antigua (text) antes de recrear con (text, text).
-- PostgreSQL no puede resolver CREATE OR REPLACE cuando hay múltiples overloads
-- con el mismo nombre y ambos parámetros tienen DEFAULT NULL.
-- ============================================================================

-- Eliminar la firma antigua (solo p_status) para evitar ambigüedad
DROP FUNCTION IF EXISTS public.list_orders(text);

CREATE OR REPLACE FUNCTION public.list_orders(
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL          -- búsqueda libre: número, cliente, técnico
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_result       jsonb;
  v_search_lower text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.profiles WHERE id = v_user_id;

  IF NOT public.check_feature_access(v_workspace_id, 'orders_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'orders_not_included');
  END IF;

  -- Normalizar búsqueda
  v_search_lower := LOWER(TRIM(COALESCE(p_search, '')));

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',            o.id,
      'order_number',  o.order_number,
      'title',         o.title,
      'description',   o.description,
      'status',        o.status,
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
    AND (
      v_search_lower = ''                                               -- sin búsqueda
      OR LOWER(o.order_number)            LIKE '%' || v_search_lower || '%'
      OR LOWER(o.title)                   LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(c.name, ''))      LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(c.phone, ''))     LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(c.email, ''))     LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(p_a.full_name, '')) LIKE '%' || v_search_lower || '%'
      OR LOWER(COALESCE(o.status, ''))    LIKE '%' || v_search_lower || '%'
    );

  RETURN jsonb_build_object('ok', true, 'orders', COALESCE(v_result, '[]'::jsonb));
END;
$$;

-- GRANT explícito con la firma completa (obligatorio tras el DROP de la anterior)
GRANT EXECUTE ON FUNCTION public.list_orders(text, text) TO authenticated;

COMMENT ON FUNCTION public.list_orders IS
  'Sprint FASE3: búsqueda server-side por número, cliente, técnico, estado. Debounce 300ms en UI.';
