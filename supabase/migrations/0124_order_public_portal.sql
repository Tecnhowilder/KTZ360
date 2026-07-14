-- ============================================================================
-- 0124 — order_public_portal
--
-- Portal público para Pedidos con el mismo nivel de seguridad que Cotizaciones.
--
-- Tablas:
--   order_access_tokens  — tokens UUID únicos por pedido (como quote_access_tokens)
--   order_events         — bitácora de apertura/descarga del pedido público
--
-- RPCs (SECURITY DEFINER, Zero Trust):
--   get_or_create_order_token(p_order_id)  → genera token si no existe
--   get_public_order(p_token)              → devuelve datos públicos del pedido
--   register_order_event(p_token, p_event) → registra evento de visualización
--
-- RLS:
--   Acceso autenticado por workspace (gestión interna)
--   Acceso anónimo por token (portal cliente)
--
-- Escalabilidad (5000+ usuarios):
--   Índice en token (UUID, búsqueda O(1) con pg hash)
--   Índice en order_id para lookup rápido de token existente
--   Política anon usa token directo — sin JOINs costosos
-- ============================================================================

-- ─── Tabla: order_access_tokens ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_access_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id)  ON DELETE CASCADE,
  order_id     uuid NOT NULL REFERENCES public.orders(id)       ON DELETE CASCADE,
  token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)  -- un token por pedido
);

CREATE INDEX IF NOT EXISTS idx_order_access_tokens_token    ON public.order_access_tokens (token);
CREATE INDEX IF NOT EXISTS idx_order_access_tokens_order_id ON public.order_access_tokens (order_id);
CREATE INDEX IF NOT EXISTS idx_order_access_tokens_ws       ON public.order_access_tokens (workspace_id);

-- ─── Tabla: order_events ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id     uuid NOT NULL REFERENCES public.orders(id)      ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN (
    'order_viewed', 'order_downloaded', 'order_shared'
  )),
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order ON public.order_events (order_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.order_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events        ENABLE ROW LEVEL SECURITY;

-- Acceso autenticado por workspace (panel interno)
CREATE POLICY "workspace members manage order tokens"
  ON public.order_access_tokens FOR ALL TO authenticated
  USING (workspace_id = public.current_workspace_id())
  WITH CHECK (workspace_id = public.current_workspace_id());

CREATE POLICY "workspace members manage order events"
  ON public.order_events FOR ALL TO authenticated
  USING (workspace_id = public.current_workspace_id())
  WITH CHECK (workspace_id = public.current_workspace_id());

-- Sin policies de acceso directo para anon:
-- get_public_order() y register_order_event() son SECURITY DEFINER → bypass RLS.
-- USING(true) / WITH CHECK(true) para anon expondrían todos los tokens via REST.

-- ─── RPC: get_or_create_order_token ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_or_create_order_token(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid := auth.uid();
  v_workspace_id uuid;
  v_token        uuid;
BEGIN
  -- Zero Trust: obtener workspace del caller
  SELECT workspace_id INTO v_workspace_id
    FROM public.profiles WHERE id = v_caller_id;

  -- Validar que el pedido pertenece al workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id AND workspace_id = v_workspace_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Pedido no encontrado o sin acceso';
  END IF;

  -- Buscar token existente
  SELECT token INTO v_token
    FROM public.order_access_tokens
   WHERE order_id = p_order_id;

  -- Crear si no existe
  IF v_token IS NULL THEN
    INSERT INTO public.order_access_tokens (workspace_id, order_id)
    VALUES (v_workspace_id, p_order_id)
    RETURNING token INTO v_token;
  END IF;

  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_order_token(uuid) TO authenticated;

-- ─── RPC: get_public_order ────────────────────────────────────────────────────

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
  -- Buscar token
  SELECT order_id, workspace_id INTO v_token_row
    FROM public.order_access_tokens
   WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalid');
  END IF;

  -- Obtener pedido (solo campos públicos — excluye workspace_id, created_by, assigned_to, etc.)
  SELECT o.id, o.order_number, o.title, o.description, o.status,
         o.order_snapshot, o.total_amount, o.scheduled_at, o.started_at,
         o.finished_at, o.notes, o.created_at, o.client_id
    INTO v_order
    FROM public.orders o
   WHERE o.id = v_token_row.order_id AND o.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- Obtener cliente (puede ser NULL para pedidos directos sin cliente asignado)
  IF v_order.client_id IS NOT NULL THEN
    SELECT id, name, phone, email, city INTO v_client
      FROM public.clients
     WHERE id = v_order.client_id;
  END IF;

  -- Obtener configuración de la empresa (nombre, logo, etc.)
  SELECT name, nit, phone, email, city, logo_path INTO v_company
    FROM public.company_settings
   WHERE workspace_id = v_token_row.workspace_id;

  -- Registrar visualización
  INSERT INTO public.order_events (workspace_id, order_id, event_type)
  VALUES (v_token_row.workspace_id, v_order.id, 'order_viewed')
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

-- ─── RPC: register_order_event ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.register_order_event(
  p_token      uuid,
  p_event      text,
  p_metadata   jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_row RECORD;
BEGIN
  SELECT * INTO v_token_row
    FROM public.order_access_tokens
   WHERE token = p_token;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.order_events (workspace_id, order_id, event_type, metadata)
  VALUES (v_token_row.workspace_id, v_token_row.order_id, p_event, p_metadata);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_order_event(uuid, text, jsonb) TO anon, authenticated;

COMMENT ON TABLE  public.order_access_tokens IS 'Tokens UUID para acceso público a pedidos. Mismo patrón que quote_access_tokens.';
COMMENT ON TABLE  public.order_events        IS 'Bitácora de eventos del portal público de pedidos.';
