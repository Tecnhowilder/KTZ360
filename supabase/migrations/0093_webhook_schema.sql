-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0093: Webhook Marketplace — Schema
-- ════════════════════════════════════════════════════════════════════════════
-- Diseño: provider_type ('webhook'|'zapier'|'make'|'n8n') en webhook_endpoints.
-- Sin nuevos triggers — reutiliza trg_quotes/orders/work_orders_automation_dispatch.
-- HMAC-SHA256: secret almacenado en tabla. Solo service_role puede leerlo.
-- RLS: workspace isolation obligatorio.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. webhook_endpoints — configuración de destinos salientes ───────────────

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label                  text        NOT NULL,
  url                    text        NOT NULL,
  provider_type          text        NOT NULL DEFAULT 'webhook' CHECK (provider_type IN (
    'webhook',   -- URL personalizada (cualquier sistema)
    'zapier',    -- Zapier Catch Hook URL
    'make',      -- Make (Integromat) Custom Webhook
    'n8n'        -- n8n Webhook node
  )),
  events                 text[]      NOT NULL DEFAULT '{}',
  secret                 text        NOT NULL,  -- Generado server-side. NUNCA expuesto al frontend.
  is_active              boolean     NOT NULL DEFAULT true,
  -- Resiliencia: auto-deshabilitación por fallos consecutivos
  failure_count          int         NOT NULL DEFAULT 0,
  consecutive_failures   int         NOT NULL DEFAULT 0,
  max_consecutive_failures int       NOT NULL DEFAULT 5,
  last_success_at        timestamptz,
  last_failure_at        timestamptz,
  disabled_at            timestamptz,
  disabled_reason        text,
  -- Auditoría
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_webhook_endpoints_updated_at
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_workspace
  ON public.webhook_endpoints(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_events
  ON public.webhook_endpoints USING GIN(events);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- workspace members pueden VER sus endpoints (excepto el secret — omitido en RPCs)
CREATE POLICY "workspace members select webhook_endpoints"
  ON public.webhook_endpoints FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE workspace_id = webhook_endpoints.workspace_id AND id = auth.uid()
  ));

-- Solo owner/admin pueden gestionar endpoints
CREATE POLICY "owner admin manage webhook_endpoints"
  ON public.webhook_endpoints FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE workspace_id = webhook_endpoints.workspace_id
      AND id = auth.uid()
      AND role IN ('owner','admin') AND status = 'active'
  ));

-- ─── 2. webhook_deliveries — log de entregas ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  endpoint_id      uuid        NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type       text        NOT NULL,
  event_id         uuid        NOT NULL DEFAULT gen_random_uuid(),  -- único por intento, para idempotencia
  payload          jsonb       NOT NULL,           -- payload completo enviado
  response_status  int,
  response_body    text,
  duration_ms      int,
  attempt          int         NOT NULL DEFAULT 1,
  max_attempts     int         NOT NULL DEFAULT 3,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- encolado, aún no enviado
    'delivered',  -- respuesta 2xx
    'failed',     -- agotados reintentos
    'retrying'    -- fallo temporal, hay más intentos
  )),
  delivered_at     timestamptz,
  next_retry_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_workspace
  ON public.webhook_deliveries(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint
  ON public.webhook_deliveries(endpoint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON public.webhook_deliveries(status, next_retry_at)
  WHERE status IN ('pending','retrying');

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members select webhook_deliveries"
  ON public.webhook_deliveries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE workspace_id = webhook_deliveries.workspace_id AND id = auth.uid()
  ));

-- Inserts solo via service_role (integration-worker) o SECURITY DEFINER RPCs
CREATE POLICY "service manages webhook_deliveries"
  ON public.webhook_deliveries FOR ALL
  USING (auth.uid() IS NULL);

-- ─── 3. plan_features: añadir webhook_enabled ────────────────────────────────

ALTER TABLE public.plan_features
  ADD COLUMN IF NOT EXISTS webhook_enabled boolean NOT NULL DEFAULT false;

UPDATE public.plan_features SET webhook_enabled = false WHERE plan_code = 'free';
UPDATE public.plan_features SET webhook_enabled = true  WHERE plan_code = 'pro';
UPDATE public.plan_features SET webhook_enabled = true  WHERE plan_code = 'premium';

-- Añadir 'webhook_enabled' a la whitelist de check_feature_access
-- (Recrear la función para incluirla)
CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_workspace_id uuid,
  p_feature      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code text;
  v_value     boolean;
  v_allowed_features text[] := ARRAY[
    'ai_enabled', 'photo_quote_enabled', 'templates_enabled',
    'branding_enabled', 'custom_qr_enabled', 'advanced_reports_enabled',
    'multiuser_enabled', 'quote_editing_enabled',
    'pipeline_enabled', 'orders_enabled', 'work_orders_enabled',
    'gps_enabled', 'ai_credits_enabled', 'founder_eligible',
    'storage_enabled', 'automation_enabled',
    'webhook_enabled'   -- Sprint Webhooks
  ];
BEGIN
  IF NOT (p_feature = ANY(v_allowed_features)) THEN
    RETURN false;
  END IF;

  IF public.is_support_admin() THEN
    RETURN true;
  END IF;

  v_plan_code := public.get_effective_plan_code(p_workspace_id);
  EXECUTE format(
    'SELECT %I FROM public.plan_features WHERE plan_code = $1',
    p_feature
  ) INTO v_value USING v_plan_code;

  RETURN COALESCE(v_value, false);
END;
$$;

COMMENT ON TABLE public.webhook_endpoints  IS 'Webhooks: destinos salientes por workspace. Secret nunca expuesto vía RPCs.';
COMMENT ON TABLE public.webhook_deliveries IS 'Webhooks: log de entregas con payload, status HTTP, duración y reintentos.';
COMMENT ON COLUMN public.webhook_endpoints.secret IS 'HMAC-SHA256 signing secret. Solo legible por service_role vía get_webhook_endpoint_secret().';
