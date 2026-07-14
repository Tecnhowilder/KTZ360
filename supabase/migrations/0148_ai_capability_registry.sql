-- ============================================================================
-- 0148 — AI Capability Registry + Provider Policies + Governance + Enable NVIDIA
-- ============================================================================
-- RESUMEN DE CAMBIOS:
--   1. Habilitar NVIDIA NIM (NVIDIA_API_KEY ya configurada en Supabase Secrets)
--   2. ai_model_capabilities — capacidades por modelo (routing por capacidad, no por nombre)
--   3. ai_routing_policies   — políticas administrables de enrutamiento
--   4. ai_governance_rules   — reglas de gobernanza (PII, GDPR, Habeas Data)
-- ============================================================================

-- ─── 1. Habilitar NVIDIA NIM ──────────────────────────────────────────────────

UPDATE public.ai_providers
SET enabled = true, updated_at = now()
WHERE provider_key = 'nvidia';

-- ─── 2. AI Capability Registry ────────────────────────────────────────────────
-- El Orchestrator decide por CAPACIDADES requeridas, no por nombre del proveedor.

CREATE TABLE IF NOT EXISTS public.ai_model_capabilities (
  id              uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key    text   NOT NULL REFERENCES public.ai_providers(provider_key) ON DELETE CASCADE,
  model_id        text   NOT NULL,
  capability      text   NOT NULL, -- 'vision','ocr','streaming','json_mode','function_calling',
                                   -- 'reasoning','embeddings','audio','image_gen','pdf',
                                   -- 'tool_calling','long_context','structured_output',
                                   -- 'prompt_caching','batch_mode','multimodal'
  level           text   NOT NULL DEFAULT 'full'  -- 'full','partial','experimental','none'
    CHECK (level IN ('full','partial','experimental','none')),
  notes           text,
  verified        boolean NOT NULL DEFAULT false, -- ¿verificado en benchmark?
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_key, model_id, capability)
);

-- Capacidades de Gemini 2.5 Flash
INSERT INTO public.ai_model_capabilities (provider_key, model_id, capability, level, verified)
VALUES
  ('gemini','gemini-2.5-flash','vision',            'full',         true),
  ('gemini','gemini-2.5-flash','ocr',               'full',         true),
  ('gemini','gemini-2.5-flash','multimodal',        'full',         true),
  ('gemini','gemini-2.5-flash','json_mode',         'full',         true),
  ('gemini','gemini-2.5-flash','structured_output', 'full',         true),
  ('gemini','gemini-2.5-flash','long_context',      'full',         true),
  ('gemini','gemini-2.5-flash','reasoning',         'partial',      true),
  ('gemini','gemini-2.5-flash','function_calling',  'full',         true),
  ('gemini','gemini-2.5-flash','streaming',         'full',         true),
  ('gemini','gemini-2.5-flash','pdf',               'full',         true),
  ('gemini','gemini-2.5-flash','prompt_caching',    'experimental', false)
ON CONFLICT (provider_key, model_id, capability) DO UPDATE SET level = excluded.level;

-- Capacidades de Gemini 1.5 Pro
INSERT INTO public.ai_model_capabilities (provider_key, model_id, capability, level, verified)
VALUES
  ('gemini','gemini-1.5-pro','vision',            'full', true),
  ('gemini','gemini-1.5-pro','ocr',               'full', true),
  ('gemini','gemini-1.5-pro','multimodal',        'full', true),
  ('gemini','gemini-1.5-pro','json_mode',         'full', true),
  ('gemini','gemini-1.5-pro','structured_output', 'full', true),
  ('gemini','gemini-1.5-pro','long_context',      'full', true),
  ('gemini','gemini-1.5-pro','reasoning',         'full', true),
  ('gemini','gemini-1.5-pro','pdf',               'full', true)
ON CONFLICT (provider_key, model_id, capability) DO UPDATE SET level = excluded.level;

-- Capacidades NVIDIA Nemotron 70B (texto — no tiene visión)
INSERT INTO public.ai_model_capabilities (provider_key, model_id, capability, level, verified)
VALUES
  ('nvidia','nvidia/llama-3.1-nemotron-70b-instruct','json_mode',         'full',    false),
  ('nvidia','nvidia/llama-3.1-nemotron-70b-instruct','structured_output', 'full',    false),
  ('nvidia','nvidia/llama-3.1-nemotron-70b-instruct','reasoning',         'full',    false),
  ('nvidia','nvidia/llama-3.1-nemotron-70b-instruct','function_calling',  'partial', false),
  ('nvidia','nvidia/llama-3.1-nemotron-70b-instruct','streaming',         'full',    false)
ON CONFLICT (provider_key, model_id, capability) DO UPDATE SET level = excluded.level;

-- Capacidades NVIDIA Llama 3.2 Vision 11B
INSERT INTO public.ai_model_capabilities (provider_key, model_id, capability, level, verified)
VALUES
  ('nvidia','meta/llama-3.2-11b-vision-instruct','vision',     'full',    false),
  ('nvidia','meta/llama-3.2-11b-vision-instruct','ocr',        'partial', false),
  ('nvidia','meta/llama-3.2-11b-vision-instruct','multimodal', 'full',    false),
  ('nvidia','meta/llama-3.2-11b-vision-instruct','streaming',  'full',    false)
ON CONFLICT (provider_key, model_id, capability) DO UPDATE SET level = excluded.level;

-- Capacidades NVIDIA Llama 3.1 8B (económico, solo texto)
INSERT INTO public.ai_model_capabilities (provider_key, model_id, capability, level, verified)
VALUES
  ('nvidia','meta/llama-3.1-8b-instruct','json_mode',  'partial', false),
  ('nvidia','meta/llama-3.1-8b-instruct','streaming',  'full',    false)
ON CONFLICT (provider_key, model_id, capability) DO UPDATE SET level = excluded.level;

ALTER TABLE public.ai_model_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_capabilities_admin"  ON public.ai_model_capabilities FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_capabilities_select" ON public.ai_model_capabilities FOR SELECT USING (true);

-- RPC: encontrar el mejor modelo para una capacidad requerida
CREATE OR REPLACE FUNCTION public.find_models_by_capability(
  p_capability text,
  p_level      text DEFAULT 'full'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'provider_key',  c.provider_key,
      'model_id',      c.model_id,
      'level',         c.level,
      'verified',      c.verified,
      'provider_enabled', p.enabled,
      'quality_score', pm.quality_score,
      'cost_per_1m',   pm.cost_per_1m_tokens
    ) ORDER BY pm.quality_score DESC NULLS LAST)
    FROM public.ai_model_capabilities c
    JOIN public.ai_providers         p  ON p.provider_key = c.provider_key AND p.enabled = true
    JOIN public.ai_provider_models   pm ON pm.provider_key = c.provider_key AND pm.model_id = c.model_id AND pm.enabled = true
    WHERE c.capability = p_capability
      AND c.level IN (
        CASE p_level
          WHEN 'full'         THEN ARRAY['full']
          WHEN 'partial'      THEN ARRAY['full','partial']
          WHEN 'experimental' THEN ARRAY['full','partial','experimental']
          ELSE                     ARRAY['full','partial','experimental','none']
        END
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_models_by_capability(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_models_by_capability(text, text) TO service_role;

-- ─── 3. Provider Routing Policies ─────────────────────────────────────────────
-- Reglas administrables que el Orchestrator aplica al seleccionar proveedor.

CREATE TABLE IF NOT EXISTS public.ai_routing_policies (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  description      text,
  priority         int         NOT NULL DEFAULT 50,    -- 1=más alto, mayor número=más bajo
  operation        text,                               -- NULL = aplica a todas las operaciones
  condition_type   text        NOT NULL
    CHECK (condition_type IN (
      'always_use_provider',   -- Siempre usar este proveedor para esta operación
      'never_use_provider',    -- Nunca usar este proveedor para esta operación
      'require_capability',    -- Solo usar modelos con esta capacidad
      'max_cost_usd',          -- No usar si costo estimado > valor
      'min_availability_pct',  -- Solo usar si disponibilidad >= valor
      'prefer_provider',       -- Preferir este proveedor si disponible
      'fallback_only'          -- Usar solo como fallback, nunca como primario
    )),
  provider_key     text        REFERENCES public.ai_providers(provider_key),
  capability       text,       -- Para condition_type = 'require_capability'
  threshold_value  numeric,    -- Para condiciones numéricas (costo, disponibilidad)
  enabled          boolean     NOT NULL DEFAULT true,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Políticas por defecto
INSERT INTO public.ai_routing_policies (name, description, priority, condition_type, provider_key, capability, threshold_value, notes)
VALUES
  ('OCR siempre Gemini', 'Gemini tiene mejor OCR verificado. NVIDIA como fallback.', 1, 'always_use_provider', 'gemini', null, null, 'Verificado en benchmark 2025'),
  ('NVIDIA solo fallback por ahora', 'NVIDIA aún en período de benchmark — no como primario hasta validación completa.', 2, 'fallback_only', 'nvidia', null, null, 'Revisar tras 30 días de benchmark'),
  ('Máximo costo por request', 'No ejecutar operaciones con costo > $0.05 USD sin aprobación.', 5, 'max_cost_usd', null, null, 0.05, 'Protección de costos'),
  ('Visión requiere capacidad verificada', 'Solo modelos con capacidad vision=full verificada.', 3, 'require_capability', null, 'vision', null, 'Zero Trust para OCR y foto')
ON CONFLICT DO NOTHING;

ALTER TABLE public.ai_routing_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_policies_admin"  ON public.ai_routing_policies FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_policies_select" ON public.ai_routing_policies FOR SELECT USING (true);

-- ─── 4. AI Governance Rules ───────────────────────────────────────────────────
-- Reglas de gobernanza: PII, GDPR, Habeas Data, LGPD.

CREATE TABLE IF NOT EXISTS public.ai_governance_rules (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  description           text,
  rule_type             text        NOT NULL
    CHECK (rule_type IN (
      'pii_detection',      -- Detectar PII en el prompt antes de enviarlo
      'output_filter',      -- Filtrar respuesta antes de devolver al usuario
      'data_classification',-- Clasificar qué tipo de dato se está procesando
      'audit_required',     -- Forzar registro de auditoría para esta operación
      'consent_required'    -- Verificar que el usuario dio consentimiento
    )),
  action                text        NOT NULL DEFAULT 'log'
    CHECK (action IN ('block','anonymize','log','alert','require_confirmation')),
  applies_to_operations text[],     -- NULL = todas las operaciones
  pattern_keywords      text[],     -- palabras clave a detectar en el prompt
  regex_pattern         text,       -- patrón regex opcional
  enabled               boolean     NOT NULL DEFAULT true,
  framework             text,       -- 'GDPR','LGPD','HABEAS_DATA','internal'
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Reglas de gobernanza por defecto
INSERT INTO public.ai_governance_rules (name, description, rule_type, action, framework, pattern_keywords, notes)
VALUES
  ('Registro de auditoría IA', 'Toda operación IA debe quedar registrada con workspace_id y user_id.', 'audit_required', 'log', 'internal', null, 'Cumplimiento básico — sin excepción'),
  ('No PII en documentos financieros', 'Alertar si el prompt contiene datos financieros sensibles (cuentas, NIT).', 'pii_detection', 'alert', 'HABEAS_DATA', ARRAY['cuenta bancaria','nit','cedula','rut','cvc','cvv'], 'Habeas Data Colombia'),
  ('Anonimizar datos de terceros', 'Cuando se procesen datos de clientes de terceros, usar datos anonimizados.', 'data_classification', 'log', 'LGPD', null, 'Preparación LGPD Brasil'),
  ('Bloquear contraseñas/tokens en prompts', 'No permitir prompts que contengan credenciales literales.', 'pii_detection', 'block', 'internal', ARRAY['password','contraseña','token','api_key','secret','bearer'], 'Prevención de credential leak')
ON CONFLICT DO NOTHING;

ALTER TABLE public.ai_governance_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_governance_admin"  ON public.ai_governance_rules FOR ALL USING (public.is_support_admin());
CREATE POLICY "ai_governance_select" ON public.ai_governance_rules FOR SELECT USING (true);

-- ─── 5. Comentarios ───────────────────────────────────────────────────────────

COMMENT ON TABLE public.ai_model_capabilities IS
  'Capacidades por modelo. Orchestrator rutea por capacidad, no por nombre de proveedor.';
COMMENT ON TABLE public.ai_routing_policies IS
  'Políticas administrables de enrutamiento. Todo configurable desde Backoffice, sin tocar código.';
COMMENT ON TABLE public.ai_governance_rules IS
  'Reglas de gobernanza IA: GDPR, LGPD, Habeas Data. Aplican antes/después de cada llamada.';
