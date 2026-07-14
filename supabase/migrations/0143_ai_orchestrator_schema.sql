-- ============================================================================
-- 0143 — AI Orchestrator: Schema completo del motor de orquestación
-- ============================================================================
-- Tablas:
--   ai_providers           — registro de proveedores IA
--   ai_provider_models     — modelos por proveedor
--   ai_provider_health     — métricas de salud en tiempo real
--   ai_operation_pricing   — motor de rentabilidad por operación
--   ai_request_log         — observabilidad completa de cada llamada
--   ai_cache               — cache inteligente de respuestas
--   ai_benchmark_results   — resultados de benchmarks automáticos
-- ============================================================================

-- ─── 1. Proveedores IA ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_providers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key        text        NOT NULL UNIQUE,   -- 'gemini', 'nvidia', 'openai', etc.
  name                text        NOT NULL,
  base_url            text        NOT NULL,
  api_key_secret      text        NOT NULL,          -- nombre del Deno secret (nunca la clave)
  enabled             boolean     NOT NULL DEFAULT false,
  priority            int         NOT NULL DEFAULT 50, -- 1=más alto, 100=más bajo
  is_primary          boolean     NOT NULL DEFAULT false,
  supports_vision     boolean     NOT NULL DEFAULT false,
  supports_streaming  boolean     NOT NULL DEFAULT false,
  quality_score       numeric(4,2) NOT NULL DEFAULT 85.0,  -- 0-100 manual/benchmark
  cost_score          numeric(4,2) NOT NULL DEFAULT 50.0,  -- 0-100 (100=muy barato)
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Gemini (proveedor primario)
INSERT INTO public.ai_providers (provider_key, name, base_url, api_key_secret, enabled, priority, is_primary, supports_vision, quality_score, cost_score)
VALUES ('gemini', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta', 'GEMINI_API_KEY', true, 1, true, true, 88.0, 82.0)
ON CONFLICT (provider_key) DO UPDATE SET
  name=excluded.name, base_url=excluded.base_url, api_key_secret=excluded.api_key_secret,
  enabled=excluded.enabled, priority=excluded.priority, is_primary=excluded.is_primary,
  supports_vision=excluded.supports_vision, quality_score=excluded.quality_score, cost_score=excluded.cost_score,
  updated_at=now();

-- NVIDIA NIM (primer proveedor adicional)
INSERT INTO public.ai_providers (provider_key, name, base_url, api_key_secret, enabled, priority, is_primary, supports_vision, quality_score, cost_score, notes)
VALUES ('nvidia', 'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1', 'NVIDIA_API_KEY', false, 2, false, true, 85.0, 90.0,
  'Habilitar tras configurar NVIDIA_API_KEY en Supabase Secrets')
ON CONFLICT (provider_key) DO UPDATE SET
  name=excluded.name, base_url=excluded.base_url, api_key_secret=excluded.api_key_secret,
  priority=excluded.priority, supports_vision=excluded.supports_vision,
  quality_score=excluded.quality_score, cost_score=excluded.cost_score, notes=excluded.notes,
  updated_at=now();

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_providers_admin" ON public.ai_providers FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_providers_select" ON public.ai_providers FOR SELECT USING (true);

-- ─── 2. Modelos por proveedor ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_provider_models (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key        text        NOT NULL REFERENCES public.ai_providers(provider_key) ON DELETE CASCADE,
  model_id            text        NOT NULL,          -- ID real del modelo para la API
  model_alias         text        NOT NULL,          -- nombre visible para admins
  supports_vision     boolean     NOT NULL DEFAULT false,
  supports_text       boolean     NOT NULL DEFAULT true,
  quality_score       numeric(4,2) NOT NULL DEFAULT 85.0,
  cost_per_1m_tokens  numeric(8,4) NOT NULL DEFAULT 0.15, -- USD por 1M tokens entrada
  max_tokens_output   int         NOT NULL DEFAULT 2000,
  is_default          boolean     NOT NULL DEFAULT false,
  is_default_vision   boolean     NOT NULL DEFAULT false,
  enabled             boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, model_id)
);

-- Modelos Gemini
INSERT INTO public.ai_provider_models (provider_key, model_id, model_alias, supports_vision, quality_score, cost_per_1m_tokens, max_tokens_output, is_default, is_default_vision)
VALUES
  ('gemini', 'gemini-2.5-flash', 'Gemini 2.5 Flash', true,  88.0, 0.075, 8192, true,  true),
  ('gemini', 'gemini-2.0-flash', 'Gemini 2.0 Flash', true,  84.0, 0.075, 8192, false, false),
  ('gemini', 'gemini-1.5-pro',   'Gemini 1.5 Pro',   true,  90.0, 1.25,  8192, false, false)
ON CONFLICT (provider_key, model_id) DO UPDATE SET
  model_alias=excluded.model_alias, supports_vision=excluded.supports_vision,
  quality_score=excluded.quality_score, cost_per_1m_tokens=excluded.cost_per_1m_tokens,
  max_tokens_output=excluded.max_tokens_output, is_default=excluded.is_default,
  is_default_vision=excluded.is_default_vision;

-- Modelos NVIDIA NIM
INSERT INTO public.ai_provider_models (provider_key, model_id, model_alias, supports_vision, quality_score, cost_per_1m_tokens, max_tokens_output, is_default, is_default_vision)
VALUES
  ('nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', 'Nemotron 70B',         false, 88.0, 0.20,  4096, true,  false),
  ('nvidia', 'meta/llama-3.2-11b-vision-instruct',     'Llama 3.2 Vision 11B', true,  82.0, 0.16,  4096, false, true),
  ('nvidia', 'meta/llama-3.1-8b-instruct',             'Llama 3.1 8B',         false, 78.0, 0.06,  4096, false, false),
  ('nvidia', 'mistralai/mistral-7b-instruct-v0.3',     'Mistral 7B',           false, 75.0, 0.06,  4096, false, false)
ON CONFLICT (provider_key, model_id) DO UPDATE SET
  model_alias=excluded.model_alias, quality_score=excluded.quality_score,
  cost_per_1m_tokens=excluded.cost_per_1m_tokens, max_tokens_output=excluded.max_tokens_output;

ALTER TABLE public.ai_provider_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_models_admin"  ON public.ai_provider_models FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_models_select" ON public.ai_provider_models FOR SELECT USING (true);

-- ─── 3. Salud de proveedores ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_provider_health (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key        text        NOT NULL REFERENCES public.ai_providers(provider_key) ON DELETE CASCADE,
  checked_at          timestamptz NOT NULL DEFAULT now(),
  status              text        NOT NULL DEFAULT 'unknown'  -- 'ok','degraded','down','unknown'
    CHECK (status IN ('ok','degraded','down','unknown')),
  latency_ms          int,        -- latencia promedio última verificación
  error_rate_pct      numeric(5,2) DEFAULT 0,  -- % errores última hora
  success_count_1h    int         DEFAULT 0,
  error_count_1h      int         DEFAULT 0,
  rpm_current         int         DEFAULT 0,   -- requests/minuto actuales
  availability_score  numeric(4,2) DEFAULT 100.0, -- 0-100
  last_error          text,
  is_circuit_open     boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_health_key_time
  ON public.ai_provider_health(provider_key, checked_at DESC);

ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_health_admin"  ON public.ai_provider_health FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_health_select" ON public.ai_provider_health FOR SELECT USING (true);

-- ─── 4. Motor de rentabilidad por operación ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_operation_pricing (
  operation             text        PRIMARY KEY REFERENCES public.ai_operation_costs(operation),
  credits_cost          int         NOT NULL DEFAULT 3,   -- créditos que se cobran al usuario
  estimated_usd_cost    numeric(8,6) NOT NULL DEFAULT 0.001, -- costo real estimado
  max_allowed_usd       numeric(8,6) NOT NULL DEFAULT 0.01,  -- si supera esto → proveedor alternativo
  minimum_margin_pct    numeric(5,2) NOT NULL DEFAULT 40.0,  -- margen mínimo aceptable %
  quality_level         text        NOT NULL DEFAULT 'standard'  -- 'economy','standard','premium'
    CHECK (quality_level IN ('economy','standard','premium')),
  preferred_provider    text        REFERENCES public.ai_providers(provider_key),
  preferred_model       text,
  fallback_provider     text        REFERENCES public.ai_providers(provider_key),
  fallback_model        text,
  requires_vision       boolean     NOT NULL DEFAULT false,
  cache_enabled         boolean     NOT NULL DEFAULT false,
  cache_ttl_minutes     int         NOT NULL DEFAULT 60,
  enabled               boolean     NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_operation_pricing
  (operation, credits_cost, estimated_usd_cost, max_allowed_usd, minimum_margin_pct, quality_level, preferred_provider, preferred_model, fallback_provider, fallback_model, requires_vision, cache_enabled, cache_ttl_minutes)
VALUES
  ('generate_description',      1, 0.0003, 0.002, 60.0, 'economy',  'gemini', 'gemini-2.5-flash', 'nvidia', 'meta/llama-3.1-8b-instruct',         false, true,  120),
  ('improve_proposal',          2, 0.0006, 0.005, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, false,  0),
  ('ai_summary',                2, 0.0005, 0.004, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  30),
  ('close_probability',         3, 0.0004, 0.003, 60.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  60),
  ('recommendations',           3, 0.0007, 0.005, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, false,  0),
  ('photo_quote',               5, 0.0020, 0.010, 50.0, 'premium',  'gemini', 'gemini-2.5-flash', 'nvidia', 'meta/llama-3.2-11b-vision-instruct',  true,  false,  0),
  ('forecast',                  4, 0.0010, 0.006, 50.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  120),
  ('forecast_finance',          4, 0.0010, 0.006, 50.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  120),
  ('risk_analysis',             3, 0.0008, 0.005, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  60),
  ('bi_executive_summary',      4, 0.0012, 0.007, 50.0, 'premium',  'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  30),
  ('bi_business_forecast',      4, 0.0012, 0.007, 50.0, 'premium',  'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  30),
  ('bi_risk_assessment',        3, 0.0008, 0.005, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  60),
  ('bi_growth_recs',            4, 0.0010, 0.006, 50.0, 'premium',  'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, false,  0),
  ('ia_voice_interpret',        3, 0.0008, 0.005, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, false,  0),
  ('ia_photo_interpret',        5, 0.0020, 0.010, 50.0, 'premium',  'gemini', 'gemini-2.5-flash', 'nvidia', 'meta/llama-3.2-11b-vision-instruct',  true,  false,  0),
  ('ia_full_create',            5, 0.0025, 0.012, 45.0, 'premium',  'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, false,  0),
  ('ops_risk_detection',        3, 0.0008, 0.005, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  30),
  ('ops_delay_analysis',        3, 0.0008, 0.005, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  30),
  ('ops_productivity_analysis', 3, 0.0008, 0.005, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  30),
  ('ops_cost_analysis',         3, 0.0008, 0.005, 55.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  30),
  ('ops_project_risk',          3, 0.0010, 0.006, 50.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, true,  30),
  ('ops_recommendations',       3, 0.0010, 0.006, 50.0, 'standard', 'gemini', 'gemini-2.5-flash', 'nvidia', 'nvidia/llama-3.1-nemotron-70b-instruct', false, false,  0)
ON CONFLICT (operation) DO UPDATE SET
  credits_cost=excluded.credits_cost, estimated_usd_cost=excluded.estimated_usd_cost,
  max_allowed_usd=excluded.max_allowed_usd, minimum_margin_pct=excluded.minimum_margin_pct,
  quality_level=excluded.quality_level, preferred_provider=excluded.preferred_provider,
  preferred_model=excluded.preferred_model, fallback_provider=excluded.fallback_provider,
  fallback_model=excluded.fallback_model, requires_vision=excluded.requires_vision,
  cache_enabled=excluded.cache_enabled, cache_ttl_minutes=excluded.cache_ttl_minutes,
  updated_at=now();

ALTER TABLE public.ai_operation_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_pricing_admin"  ON public.ai_operation_pricing FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_pricing_select" ON public.ai_operation_pricing FOR SELECT USING (true);

-- ─── 5. Log completo de requests (observabilidad) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_request_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          text        NOT NULL,           -- x-request-id del header
  correlation_id      text,
  workspace_id        uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  operation           text        NOT NULL,
  ai_mode             text        NOT NULL DEFAULT 'balanced'  -- 'balanced','quality','economy','auto'
    CHECK (ai_mode IN ('balanced','quality','economy','auto')),

  -- Proveedor seleccionado
  provider_selected   text        NOT NULL,
  model_selected      text        NOT NULL,
  provider_score      numeric(5,2),

  -- Resultado
  success             boolean     NOT NULL DEFAULT false,
  fallback_used       boolean     NOT NULL DEFAULT false,
  fallback_provider   text,
  cache_hit           boolean     NOT NULL DEFAULT false,

  -- Tiempos
  latency_ms          int,
  gemini_ms           int,          -- tiempo llamada proveedor

  -- Costos
  tokens_input        int         DEFAULT 0,
  tokens_output       int         DEFAULT 0,
  tokens_total        int         DEFAULT 0,
  real_cost_usd       numeric(10,8) DEFAULT 0,
  credits_consumed    int         DEFAULT 0,
  margin_pct          numeric(5,2),

  -- Error
  error_code          text,
  error_message       text,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_request_log_workspace ON public.ai_request_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_log_provider  ON public.ai_request_log(provider_selected, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_request_log_operation ON public.ai_request_log(operation, created_at DESC);

-- Retención: auto-purge registros > 90 días (ejecutar vía pg_cron)
COMMENT ON TABLE public.ai_request_log IS
  'Log de observabilidad de cada llamada IA. Retención 90 días. Solo lectura para admins.';

ALTER TABLE public.ai_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_log_admin"  ON public.ai_request_log FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_log_insert" ON public.ai_request_log FOR INSERT WITH CHECK (true);

-- ─── 6. Cache inteligente de respuestas ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_cache (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key       text        NOT NULL UNIQUE,   -- hash(workspace_id + operation + prompt_fingerprint)
  workspace_id    uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  operation       text        NOT NULL,
  response_text   text        NOT NULL,
  tokens_used     int         DEFAULT 0,
  hit_count       int         NOT NULL DEFAULT 0,
  credits_saved   int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  last_hit_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_key    ON public.ai_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expiry ON public.ai_cache(expires_at);

ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_cache_admin"  ON public.ai_cache FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_cache_insert" ON public.ai_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "ai_cache_select" ON public.ai_cache FOR SELECT USING (true);
CREATE POLICY "ai_cache_update" ON public.ai_cache FOR UPDATE USING (true);

-- ─── 7. Resultados de benchmark ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_benchmark_results (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id      uuid        NOT NULL,   -- agrupa un ciclo de benchmark
  provider_key      text        NOT NULL REFERENCES public.ai_providers(provider_key),
  model_id          text        NOT NULL,
  operation         text        NOT NULL,
  latency_ms        int,
  quality_score     numeric(4,2),           -- evaluado manualmente o por otro LLM
  cost_usd          numeric(10,8),
  success           boolean     NOT NULL DEFAULT false,
  error_message     text,
  shadow_mode       boolean     NOT NULL DEFAULT false, -- fue shadow (no en producción)
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_benchmark_provider ON public.ai_benchmark_results(provider_key, created_at DESC);

ALTER TABLE public.ai_benchmark_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_benchmark_admin"  ON public.ai_benchmark_results FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_benchmark_insert" ON public.ai_benchmark_results FOR INSERT WITH CHECK (true);
CREATE POLICY "ai_benchmark_select" ON public.ai_benchmark_results FOR SELECT USING (true);

COMMENT ON TABLE public.ai_benchmark_results IS
  'Resultados de benchmarks automáticos por proveedor/modelo/operación. Shadow Mode disponible.';
