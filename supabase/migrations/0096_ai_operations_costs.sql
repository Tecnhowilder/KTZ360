-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0096: IA Operativa — Registrar operaciones en ai_operation_costs
-- ════════════════════════════════════════════════════════════════════════════
-- 6 operaciones nuevas para análisis operativo IA.
-- Reutiliza: ai-proxy, check_ai_credits(), consume_ai_credits().
-- Sin nuevo motor IA. Sin nuevo proveedor.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.ai_operation_costs (operation, credits_cost, description)
VALUES
  ('ops_risk_detection',        3, 'IA: Detectar riesgos operativos (OTs + clientes + costos)'),
  ('ops_delay_analysis',        3, 'IA: Analizar OTs retrasadas y patrones de retraso'),
  ('ops_productivity_analysis', 3, 'IA: Analizar productividad por operario y detectar baja productividad'),
  ('ops_cost_analysis',         3, 'IA: Detectar desviaciones de costo y proyectos con sobrecosto'),
  ('ops_project_risk',          3, 'IA: Detectar proyectos en riesgo cruzando OTs + clientes + margen'),
  ('ops_recommendations',       3, 'IA: Generar plan de acción operativo priorizado')
ON CONFLICT (operation) DO UPDATE SET
  credits_cost = excluded.credits_cost,
  description  = excluded.description;

COMMENT ON TABLE public.ai_operation_costs IS 'Costos de créditos por operación IA. Sprint IA Operativa añade 6 operaciones ops_*.';
