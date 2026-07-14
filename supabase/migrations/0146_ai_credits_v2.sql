-- ============================================================================
-- 0146 — AI Credits v2: Rediseño de costos basado en VALOR, no en tokens
-- ============================================================================
-- FILOSOFÍA:
--   El usuario compra FUNCIONALIDADES, no tokens.
--   Los créditos representan el VALOR percibido de cada operación.
--
-- NUEVA ESCALA:
--   1 cr — Operaciones básicas de texto corto (generate_description)
--   2 cr — Mejoras de texto y resúmenes (improve_proposal, ai_summary)
--   3 cr — Análisis comerciales (close_probability, recommendations, risk, ops_*)
--   4 cr — Análisis complejos y forecast (forecast, bi_*)
--   5 cr — Operaciones multimodales (foto, full_create, photo_quote)
--
-- Cambios vs v1:
--   ia_voice_interpret: 2 → 3  (voz tiene más valor percibido)
--   ia_photo_interpret: 3 → 5  (imagen es la operación más valiosa)
--   ia_full_create:     4 → 5  (generación completa = premium)
--   forecast:           3 → 4  (análisis de negocio complejo)
--   forecast_finance:   3 → 4  (análisis financiero complejo)
--   bi_executive_summary: 3 → 4
--   bi_business_forecast: 3 → 4
--   bi_growth_recs:     3 → 4
-- ============================================================================

UPDATE public.ai_operation_costs SET credits_cost = 1, description = 'Generar descripción de producto/servicio'
  WHERE operation = 'generate_description';

UPDATE public.ai_operation_costs SET credits_cost = 2, description = 'Mejorar texto de propuesta comercial'
  WHERE operation = 'improve_proposal';

UPDATE public.ai_operation_costs SET credits_cost = 2, description = 'Resumen inteligente del dashboard'
  WHERE operation = 'ai_summary';

UPDATE public.ai_operation_costs SET credits_cost = 3, description = 'Calcular probabilidad de cierre de negocio'
  WHERE operation = 'close_probability';

UPDATE public.ai_operation_costs SET credits_cost = 3, description = 'Recomendaciones comerciales personalizadas'
  WHERE operation = 'recommendations';

UPDATE public.ai_operation_costs SET credits_cost = 5, description = 'Crear cotización completa desde fotografía (premium)'
  WHERE operation = 'photo_quote';

UPDATE public.ai_operation_costs SET credits_cost = 4, description = 'Forecast de ventas con análisis de tendencias'
  WHERE operation = 'forecast';

UPDATE public.ai_operation_costs SET credits_cost = 4, description = 'Forecast financiero y análisis de flujo de caja'
  WHERE operation = 'forecast_finance';

UPDATE public.ai_operation_costs SET credits_cost = 3, description = 'Análisis de clientes en riesgo de abandono'
  WHERE operation = 'risk_analysis';

UPDATE public.ai_operation_costs SET credits_cost = 4, description = 'Resumen ejecutivo inteligente de negocio (BI)'
  WHERE operation = 'bi_executive_summary';

UPDATE public.ai_operation_costs SET credits_cost = 4, description = 'Forecast de negocio con BI avanzado'
  WHERE operation = 'bi_business_forecast';

UPDATE public.ai_operation_costs SET credits_cost = 3, description = 'Evaluación de riesgo del portafolio (BI)'
  WHERE operation = 'bi_risk_assessment';

UPDATE public.ai_operation_costs SET credits_cost = 4, description = 'Recomendaciones de crecimiento basadas en BI'
  WHERE operation = 'bi_growth_recs';

-- Agente IA — CAMBIOS PRINCIPALES
UPDATE public.ai_operation_costs SET credits_cost = 3, description = 'Interpretar voz/texto y crear cotización o pedido'
  WHERE operation = 'ia_voice_interpret';  -- era 2, ahora 3

UPDATE public.ai_operation_costs SET credits_cost = 5, description = 'Interpretar imagen y extraer cotización/pedido completo (premium)'
  WHERE operation = 'ia_photo_interpret';  -- era 3, ahora 5

UPDATE public.ai_operation_costs SET credits_cost = 5, description = 'Generación completa de documento desde IA (premium)'
  WHERE operation = 'ia_full_create';  -- era 4, ahora 5

-- IA Operativa (sin cambios — 3 cr cada una)
UPDATE public.ai_operation_costs SET description = 'Detectar riesgos operativos (OTs + clientes + costos)'
  WHERE operation = 'ops_risk_detection';

UPDATE public.ai_operation_costs SET description = 'Analizar OTs retrasadas y patrones de retraso'
  WHERE operation = 'ops_delay_analysis';

UPDATE public.ai_operation_costs SET description = 'Analizar productividad por operario'
  WHERE operation = 'ops_productivity_analysis';

UPDATE public.ai_operation_costs SET description = 'Detectar desviaciones de costo y proyectos con sobrecosto'
  WHERE operation = 'ops_cost_analysis';

UPDATE public.ai_operation_costs SET description = 'Detectar proyectos en riesgo cruzando OTs + clientes + margen'
  WHERE operation = 'ops_project_risk';

UPDATE public.ai_operation_costs SET description = 'Generar plan de acción operativo priorizado'
  WHERE operation = 'ops_recommendations';

-- También actualizar ai_operation_pricing para mantener consistencia
UPDATE public.ai_operation_pricing SET credits_cost = c.credits_cost
FROM public.ai_operation_costs c
WHERE ai_operation_pricing.operation = c.operation;

COMMENT ON TABLE public.ai_operation_costs IS
  'v2: Créditos basados en valor percibido. Escala: 1 (básico) → 5 (multimodal/premium). Sin tokens visibles al usuario.';
