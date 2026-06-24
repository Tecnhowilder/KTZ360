-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0097: Sprint 24 Schema — IA Enterprise + Session Security + ai_usage Particionado
-- ════════════════════════════════════════════════════════════════════════════
-- Decisiones aplicadas:
--   D1: active_sessions — fuente oficial de autorización (near real-time)
--   D2: ai_usage particionado por period_month — preventivo antes de llegar a 3M filas
--   D4: 13 gaps IA autorizados
--
-- Zero Trust | Multi Tenant | No duplicar infraestructura existente
-- ════════════════════════════════════════════════════════════════════════════

-- ─── SECCIÓN A: Session Security (Decisión 1) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     text        NOT NULL,        -- fingerprint generado en frontend (localStorage)
  device_name   text,                         -- 'Chrome / MacOS', 'App iOS', etc.
  user_agent    text,
  ip            inet,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,                  -- null = activa | timestamp = revocada
  revoke_reason text,                         -- 'new_login' | 'manual' | 'expired'
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Un user+device = una sesión. Si el mismo device hace nuevo login, UPDATE no INSERT.
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user
  ON public.active_sessions(user_id, workspace_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_active_sessions_workspace
  ON public.active_sessions(workspace_id, last_seen_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

-- workspace members ven sus propias sesiones
CREATE POLICY "workspace members see own sessions"
  ON public.active_sessions FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND workspace_id = active_sessions.workspace_id
      AND role IN ('owner','admin')
  ));

-- Solo el propio usuario o service_role puede escribir
CREATE POLICY "service manages sessions"
  ON public.active_sessions FOR ALL
  USING (user_id = auth.uid() OR auth.uid() IS NULL);

-- max_sessions por plan (a futuro para ENTERPRISE)
ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS max_sessions_per_user int NOT NULL DEFAULT 1;

COMMENT ON TABLE public.active_sessions IS 'Sprint 24 D1: fuente oficial de autorización de sesiones. JWT sigue siendo el mecanismo de Supabase Auth, active_sessions añade control near-real-time.';

-- ─── SECCIÓN B: ai_usage — Particionado preventivo (Decisión 2) ──────────────
-- Estrategia: renombrar tabla actual, crear nueva particionada, copiar datos.
-- Trigger y función set_ai_usage_period() se recrean en la nueva tabla.

-- Step 1: Añadir columnas nuevas a la tabla existente ANTES de particionar
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS execution_time_ms int,
  ADD COLUMN IF NOT EXISTS model             text;

-- Step 2: Fix NULLs en period_month (necesario para partición)
UPDATE public.ai_usage
SET period_month = date_trunc('month', created_at)::date
WHERE period_month IS NULL;

-- Step 3: Renombrar tabla existente (preservar datos)
ALTER TABLE public.ai_usage RENAME TO ai_usage_legacy;
ALTER INDEX IF EXISTS idx_ai_usage_workspace RENAME TO idx_ai_usage_legacy_workspace;
ALTER INDEX IF EXISTS idx_ai_usage_period    RENAME TO idx_ai_usage_legacy_period;

-- Step 4: Eliminar trigger antiguo (se recreará en nueva tabla)
DROP TRIGGER IF EXISTS trg_ai_usage_period ON public.ai_usage_legacy;

-- Step 5: Crear nueva tabla particionada por period_month
CREATE TABLE public.ai_usage (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  feature          text        NOT NULL,
  provider         text        NOT NULL DEFAULT 'gemini',
  model            text,
  tokens_used      int         NOT NULL DEFAULT 0,
  estimated_cost   numeric(12,4) NOT NULL DEFAULT 0,
  credits_used     int         NOT NULL DEFAULT 0,
  execution_time_ms int,
  period_month     date        NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- PK debe incluir partition key
  PRIMARY KEY (id, period_month)
) PARTITION BY RANGE (period_month);

-- Step 6: Crear partición DEFAULT para datos históricos (antes de Jun 2026)
CREATE TABLE IF NOT EXISTS public.ai_usage_historical
  PARTITION OF public.ai_usage DEFAULT;

-- Step 7: Crear particiones mensuales Jun 2026 → Dic 2027
CREATE TABLE IF NOT EXISTS public.ai_usage_y2026m06 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2026m07 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2026m08 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2026m09 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2026m10 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2026m11 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2026m12 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m01 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m02 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m03 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m04 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m05 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m06 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m07 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m08 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m09 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m10 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m11 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE IF NOT EXISTS public.ai_usage_y2027m12 PARTITION OF public.ai_usage
  FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- Step 8: Copiar datos históricos
INSERT INTO public.ai_usage
  (id, workspace_id, user_id, feature, provider, model, tokens_used, estimated_cost,
   credits_used, execution_time_ms, period_month, created_at)
SELECT
  id, workspace_id, user_id, feature, provider, model, tokens_used, estimated_cost,
  credits_used, execution_time_ms,
  COALESCE(period_month, date_trunc('month', created_at)::date),
  created_at
FROM public.ai_usage_legacy
ON CONFLICT (id, period_month) DO NOTHING;

-- Step 9: Índices en nueva tabla (aplicables a todas las particiones)
CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace
  ON public.ai_usage(workspace_id, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_period
  ON public.ai_usage(workspace_id, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature_month
  ON public.ai_usage(workspace_id, feature, period_month);

-- Step 10: Recrear trigger set_ai_usage_period en nueva tabla
CREATE OR REPLACE FUNCTION public.set_ai_usage_period()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.period_month := date_trunc('month', now())::date;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ai_usage_period
  BEFORE INSERT ON public.ai_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_usage_period();

-- Step 11: Función para crear particiones futuras (llamar via pg_cron mensualmente)
CREATE OR REPLACE FUNCTION public.create_ai_usage_partition(p_year int, p_month int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partition_name text;
  v_from_date date;
  v_to_date   date;
BEGIN
  v_partition_name := format('ai_usage_y%sm%02s', p_year, p_month);
  v_from_date := make_date(p_year, p_month, 1);
  v_to_date   := v_from_date + interval '1 month';

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = v_partition_name) THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.ai_usage FOR VALUES FROM (%L) TO (%L)',
      v_partition_name, v_from_date, v_to_date
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ai_usage_partition(int, int) TO service_role;

COMMENT ON TABLE public.ai_usage IS 'Sprint 24 D2: tabla particionada por period_month. Particiones mensuales hasta Dic 2027. Usar create_ai_usage_partition() para agregar más.';
COMMENT ON TABLE public.ai_usage_legacy IS 'Sprint 24: backup de ai_usage antes de particionar. Eliminar después de validar.';

-- ─── SECCIÓN C: IA Enterprise — Feature flags y límites (Decisión 4) ─────────

-- Nuevas feature flags
ALTER TABLE public.plan_features
  ADD COLUMN IF NOT EXISTS ai_advanced_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_forecasting_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_agents_enabled      boolean NOT NULL DEFAULT false;

-- Asignar valores por plan
UPDATE public.plan_features SET
  ai_advanced_enabled    = false,
  ai_forecasting_enabled = false,
  ai_agents_enabled      = false
WHERE plan_code = 'free';

UPDATE public.plan_features SET
  ai_advanced_enabled    = false,
  ai_forecasting_enabled = true,    -- PRO incluye forecast comercial
  ai_agents_enabled      = false
WHERE plan_code = 'pro';

UPDATE public.plan_features SET
  ai_advanced_enabled    = true,    -- PREMIUM incluye BI, Ops, CS
  ai_forecasting_enabled = true,
  ai_agents_enabled      = false    -- Agentes pendiente Sprint futuro
WHERE plan_code = 'premium';

-- Nuevos límites IA
ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS ai_max_requests_day int,    -- null = sin límite
  ADD COLUMN IF NOT EXISTS ai_max_agents       int NOT NULL DEFAULT 0;

UPDATE public.plan_limits SET ai_max_requests_day = 0,    ai_max_agents = 0 WHERE plan_code = 'free';
UPDATE public.plan_limits SET ai_max_requests_day = 50,   ai_max_agents = 0 WHERE plan_code = 'pro';
UPDATE public.plan_limits SET ai_max_requests_day = null, ai_max_agents = 0 WHERE plan_code = 'premium';

-- Actualizar check_feature_access para reconocer nuevas flags
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
    'storage_enabled', 'automation_enabled', 'webhook_enabled',
    -- Sprint 24: nuevas flags IA
    'ai_advanced_enabled', 'ai_forecasting_enabled', 'ai_agents_enabled'
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

-- ─── SECCIÓN D: ai_credit_packs y ai_credit_purchases ─────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_credit_packs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_key    text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  credits     int         NOT NULL CHECK (credits > 0),
  price_cop   int         NOT NULL CHECK (price_cop > 0),
  active      boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 0,
  -- Restricciones de plan: FREE no puede comprar
  min_plan    text        NOT NULL DEFAULT 'pro' CHECK (min_plan IN ('pro','premium','enterprise')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_credit_packs (pack_key, name, credits, price_cop, sort_order)
VALUES
  ('pack_100',  '100 Créditos IA',    100,  9900,  1),
  ('pack_500',  '500 Créditos IA',    500,  39900, 2),
  ('pack_1000', '1.000 Créditos IA',  1000, 69900, 3),
  ('pack_5000', '5.000 Créditos IA',  5000, 249900,4)
ON CONFLICT (pack_key) DO UPDATE SET
  name      = excluded.name,
  credits   = excluded.credits,
  price_cop = excluded.price_cop;

ALTER TABLE public.ai_credit_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads active packs"
  ON public.ai_credit_packs FOR SELECT USING (active = true);
CREATE POLICY "super_admin manages packs"
  ON public.ai_credit_packs FOR ALL USING (public.is_support_admin());

-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_credit_purchases (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pack_id           uuid        NOT NULL REFERENCES public.ai_credit_packs(id),
  payment_id        text        NOT NULL UNIQUE,    -- payment_id de MercadoPago
  credits_total     int         NOT NULL,
  credits_remaining int         NOT NULL,
  price_paid_cop    int         NOT NULL,
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  activated_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credits_remaining_valid CHECK (credits_remaining >= 0 AND credits_remaining <= credits_total)
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_purchases_workspace
  ON public.ai_credit_purchases(workspace_id, expires_at DESC)
  WHERE credits_remaining > 0;
-- Sprint 24 fix: now() no es IMMUTABLE → no puede usarse en predicado de índice.
-- La condición expires_at > now() se aplica en las queries, no en el índice.
CREATE INDEX IF NOT EXISTS idx_ai_credit_purchases_active
  ON public.ai_credit_purchases(workspace_id, expires_at)
  WHERE credits_remaining > 0;

ALTER TABLE public.ai_credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace reads own purchases"
  ON public.ai_credit_purchases FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE workspace_id = ai_credit_purchases.workspace_id AND id = auth.uid()
  ));
CREATE POLICY "service manages purchases"
  ON public.ai_credit_purchases FOR ALL
  USING (auth.uid() IS NULL);
CREATE POLICY "super_admin reads all purchases"
  ON public.ai_credit_purchases FOR SELECT
  USING (public.is_support_admin());

-- ─── SECCIÓN E: ai_operation_costs — preparación multi-provider ───────────────

ALTER TABLE public.ai_operation_costs
  ADD COLUMN IF NOT EXISTS preferred_provider text NOT NULL DEFAULT 'gemini'
    CHECK (preferred_provider IN ('gemini','openai','anthropic','auto'));

COMMENT ON TABLE public.ai_credit_packs     IS 'Sprint 24: catálogo de paquetes IA adicionales (100-5000 créditos). Solo PRO+.';
COMMENT ON TABLE public.ai_credit_purchases IS 'Sprint 24: historial de compras de paquetes IA. Créditos FIFO por expires_at.';
COMMENT ON TABLE public.active_sessions     IS 'Sprint 24 D1: fuente de verdad de sesiones activas. Controla 1 dispositivo por usuario.';
