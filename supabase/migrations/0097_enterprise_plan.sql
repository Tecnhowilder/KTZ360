-- ============================================================================
-- 0097 — enterprise_plan: Plan ENTERPRISE para Shelwi
-- ============================================================================
-- Sprint 24: agrega plan ENTERPRISE a plans, plan_limits y plan_features.
-- Zero Trust: precios en DB, nunca hardcodeados en código.
-- Multi Tenant: ENTERPRISE tiene límites generosos y features completos.
--
-- NOTAS TÉCNICAS (errores corregidos):
--   - plans.active (no is_active)
--   - included_users es NOT NULL con default 1 (no puede ser NULL)
--   - automation_ai_credits_pct es NOT NULL (necesita valor numérico)
--   - INSERT en plan_limits sin columnas opcionales, UPDATE posterior
-- ============================================================================

-- ─── 1. Plan ENTERPRISE en tabla plans ───────────────────────────────────────

INSERT INTO public.plans (code, name, price, currency_code, description, active)
VALUES (
  'enterprise',
  'Enterprise',
  399900,
  'COP',
  'Todo PREMIUM + API Pública + Webhooks Avanzados + SSO + Auditoría Empresarial + IA Empresarial + Agentes IA Ilimitados',
  true
)
ON CONFLICT (code) DO UPDATE SET
  price       = excluded.price,
  description = excluded.description,
  active      = true;

-- ─── 2. Feature flags en plan_features ───────────────────────────────────────

INSERT INTO public.plan_features (
  plan_code,
  ai_enabled, photo_quote_enabled, templates_enabled, branding_enabled,
  custom_qr_enabled, advanced_reports_enabled, multiuser_enabled, pdf_tier,
  quote_editing_enabled, pipeline_enabled, orders_enabled, work_orders_enabled,
  gps_enabled, ai_credits_enabled, founder_eligible, storage_enabled,
  automation_enabled, webhook_enabled
) VALUES (
  'enterprise',
  true, true, true, true,
  true, true, true, 'pro',
  true, true, true, true,
  true, true, true, true,
  true, true
)
ON CONFLICT (plan_code) DO UPDATE SET
  ai_enabled=true, photo_quote_enabled=true, templates_enabled=true, branding_enabled=true,
  custom_qr_enabled=true, advanced_reports_enabled=true, multiuser_enabled=true, pdf_tier='pro',
  quote_editing_enabled=true, pipeline_enabled=true, orders_enabled=true, work_orders_enabled=true,
  gps_enabled=true, ai_credits_enabled=true, founder_eligible=true, storage_enabled=true,
  automation_enabled=true, webhook_enabled=true, updated_at=now();

-- ─── 3. Límites en plan_limits ────────────────────────────────────────────────
-- included_users es NOT NULL (default 1), se deja en 1 y se usa included_users=1
-- para ENTERPRISE la restricción real de multiusuario viene de multiuser_enabled=true.

INSERT INTO public.plan_limits (plan_code, extra_user_price, ai_credits_monthly, max_storage_gb)
VALUES ('enterprise', 0, 5000, 100)
ON CONFLICT (plan_code) DO UPDATE SET
  extra_user_price   = 0,
  ai_credits_monthly = 5000,
  max_storage_gb     = 100,
  max_quotes_month   = NULL,
  max_clients        = NULL,
  max_catalog_items  = NULL,
  max_automations    = NULL,
  automation_ai_credits_pct = 50,
  updated_at         = now();

-- ─── 4. Comentarios ──────────────────────────────────────────────────────────

COMMENT ON TABLE public.plans IS
  'Planes Shelwi: FREE / PRO ($59.900) / PREMIUM ($179.900) / ENTERPRISE ($399.900).';
COMMENT ON TABLE public.plan_limits IS
  'ENTERPRISE: 5000 créditos IA, 100 GB storage, automatizaciones ilimitadas.';
COMMENT ON TABLE public.plan_features IS
  'ENTERPRISE: todas las features habilitadas (webhook_enabled, automation_enabled incluidos).';
