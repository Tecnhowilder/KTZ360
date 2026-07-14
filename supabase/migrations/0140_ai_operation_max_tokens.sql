-- ============================================================================
-- 0140 — ai_operation_costs: columna max_tokens por operación
-- ============================================================================
-- PROBLEMA: ai-proxy actualmente acepta max_tokens del cliente (body.max_tokens).
-- Esto permite que el cliente solicite N tokens sin límite → costos no controlados.
--
-- SOLUCIÓN: el servidor lee max_tokens de la tabla ai_operation_costs.
-- El valor del cliente se ignora (Zero Trust: server-side limits).
--
-- Cada operación tiene un límite razonado:
--   - Salidas cortas (probabilidad, badge): 200-300 tokens
--   - Resúmenes y análisis: 400-600 tokens
--   - Generación completa / foto: 1000-1500 tokens
-- ============================================================================

ALTER TABLE public.ai_operation_costs
  ADD COLUMN IF NOT EXISTS max_tokens integer NOT NULL DEFAULT 800,
  ADD COLUMN IF NOT EXISTS temperature numeric(3,2) NOT NULL DEFAULT 0.2;

COMMENT ON COLUMN public.ai_operation_costs.max_tokens IS
  'Límite máximo de tokens de salida para esta operación. Servidor lo impone; el cliente no puede superarlo.';

COMMENT ON COLUMN public.ai_operation_costs.temperature IS
  'Temperatura para generación IA. 0.0 = determinista, 1.0 = creativo.';

-- ─── Valores razonados por operación ─────────────────────────────────────────
UPDATE public.ai_operation_costs SET max_tokens = 300,  temperature = 0.1 WHERE operation = 'close_probability';
UPDATE public.ai_operation_costs SET max_tokens = 350,  temperature = 0.15 WHERE operation = 'ai_summary';
UPDATE public.ai_operation_costs SET max_tokens = 400,  temperature = 0.2  WHERE operation = 'generate_description';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.25 WHERE operation = 'improve_proposal';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.2  WHERE operation = 'forecast';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.2  WHERE operation = 'forecast_finance';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.2  WHERE operation = 'risk_analysis';
UPDATE public.ai_operation_costs SET max_tokens = 700,  temperature = 0.2  WHERE operation = 'recommendations';
UPDATE public.ai_operation_costs SET max_tokens = 800,  temperature = 0.3  WHERE operation = 'bi_executive_summary';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.2  WHERE operation = 'bi_business_forecast';
UPDATE public.ai_operation_costs SET max_tokens = 500,  temperature = 0.15 WHERE operation = 'bi_risk_assessment';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.25 WHERE operation = 'bi_growth_recs';
UPDATE public.ai_operation_costs SET max_tokens = 1000, temperature = 0.3  WHERE operation = 'ia_voice_interpret';
UPDATE public.ai_operation_costs SET max_tokens = 1200, temperature = 0.3  WHERE operation = 'ia_photo_interpret';
UPDATE public.ai_operation_costs SET max_tokens = 1500, temperature = 0.35 WHERE operation = 'ia_full_create';
UPDATE public.ai_operation_costs SET max_tokens = 1200, temperature = 0.3  WHERE operation = 'photo_quote';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.2  WHERE operation = 'ops_risk_detection';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.2  WHERE operation = 'ops_delay_analysis';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.2  WHERE operation = 'ops_productivity_analysis';
UPDATE public.ai_operation_costs SET max_tokens = 600,  temperature = 0.2  WHERE operation = 'ops_cost_analysis';
UPDATE public.ai_operation_costs SET max_tokens = 700,  temperature = 0.2  WHERE operation = 'ops_project_risk';
UPDATE public.ai_operation_costs SET max_tokens = 700,  temperature = 0.25 WHERE operation = 'ops_recommendations';
