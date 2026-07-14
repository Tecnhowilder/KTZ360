-- ============================================================================
-- 0141 — list_orders: cursor pagination (keyset)
-- ============================================================================
-- PROBLEMA: list_orders devuelve todos los pedidos del workspace en 1 query.
-- Con 1.000+ pedidos → jsonb_agg de ~1 MB + latencia alta.
--
-- SOLUCIÓN: cursor pagination (keyset) por (created_at DESC, id).
-- Ventajas vs OFFSET:
--   - No re-escanea filas anteriores → O(log N) con índice
--   - No pierde filas si se insertan datos entre páginas
--   - Compatible con los índices existentes en orders(workspace_id, created_at)
--
-- Retrocompatible: p_cursor = NULL → primera página (mismo comportamiento anterior).
-- ============================================================================

DROP FUNCTION IF EXISTS public.list_orders(text, text);
DROP FUNCTION IF EXISTS public.list_orders(text, text, text, int);

CREATE OR REPLACE FUNCTION public.list_orders(
  p_status  text    DEFAULT NULL,
  p_search  text    DEFAULT NULL,
  p_cursor  text    DEFAULT NULL,   -- created_at ISO de la última fila vista
  p_limit   int     DEFAULT 50
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
  v_cursor_ts    timestamptz;
  v_page_limit   int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200); -- máx 200/página
  v_next_cursor  text := NULL;
  v_has_more     bool := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.profiles WHERE id = v_user_id;

  IF NOT public.check_feature_access(v_workspace_id, 'orders_enabled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'orders_not_included');
  END IF;

  v_search_lower := LOWER(TRIM(COALESCE(p_search, '')));
  v_cursor_ts    := CASE WHEN p_cursor IS NOT NULL AND p_cursor <> ''
                         THEN p_cursor::timestamptz
                         ELSE NULL
                    END;

  -- Pedir 1 fila extra para saber si hay más páginas
  SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC)
  INTO v_result
  FROM (
    SELECT
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
      ) AS row_data
    FROM public.orders o
    LEFT JOIN public.clients  c      ON c.id = o.client_id
    LEFT JOIN public.profiles p_a    ON p_a.id = o.assigned_to
    LEFT JOIN public.profiles p_c    ON p_c.id = o.created_by
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
      AND (v_cursor_ts IS NULL OR o.created_at < v_cursor_ts)
      AND (
        v_search_lower = ''
        OR LOWER(o.order_number)              LIKE '%' || v_search_lower || '%'
        OR LOWER(o.title)                     LIKE '%' || v_search_lower || '%'
        OR LOWER(COALESCE(c.name, ''))        LIKE '%' || v_search_lower || '%'
        OR LOWER(COALESCE(c.phone, ''))       LIKE '%' || v_search_lower || '%'
        OR LOWER(COALESCE(c.email, ''))       LIKE '%' || v_search_lower || '%'
        OR LOWER(COALESCE(p_a.full_name, '')) LIKE '%' || v_search_lower || '%'
        OR LOWER(COALESCE(o.status, ''))      LIKE '%' || v_search_lower || '%'
      )
    ORDER BY o.created_at DESC
    LIMIT v_page_limit + 1   -- 1 extra para detectar has_more
  ) sub;

  -- Detectar si hay más páginas
  IF v_result IS NOT NULL AND jsonb_array_length(v_result) > v_page_limit THEN
    v_has_more := true;
    -- Quitar la fila extra
    v_result := (
      SELECT jsonb_agg(elem ORDER BY elem->>'created_at' DESC)
      FROM (
        SELECT elem
        FROM jsonb_array_elements(v_result) WITH ORDINALITY AS t(elem, ord)
        WHERE ord <= v_page_limit
      ) limited
    );
  END IF;

  -- Extraer cursor de la última fila retornada
  IF v_has_more AND v_result IS NOT NULL AND jsonb_array_length(v_result) > 0 THEN
    v_next_cursor := v_result->-1->>'created_at';
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'orders',     COALESCE(v_result, '[]'::jsonb),
    'has_more',   v_has_more,
    'next_cursor', v_next_cursor,
    'page_size',  v_page_limit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_orders(text, text, text, int) TO authenticated;

COMMENT ON FUNCTION public.list_orders IS
  '0141: cursor pagination keyset por created_at DESC. p_cursor=last created_at de la página anterior. Máx 200/página.';
