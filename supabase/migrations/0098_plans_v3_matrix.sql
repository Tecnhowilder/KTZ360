-- ============================================================================
-- 0098 — plans_v3_matrix: Actualización oficial de precios y storage Sprint 24
-- ============================================================================
-- CAMBIOS:
--   PRO:     $39.900 → $59.900 | storage NULL → 1 GB
--   PREMIUM: $129.900 → $179.900 | storage 5 GB → 20 GB
--   FREE:    Sin cambio de precio. Storage permanece 0.
-- COMPATIBILIDAD: idempotente con ON CONFLICT / conditional updates
-- ZERO TRUST: precios solo en DB, nunca en código frontend ni edge functions
-- ============================================================================

-- ─── 1. Actualizar precios oficiales ──────────────────────────────────────────

UPDATE public.plans SET
  price       = 59900,
  description = 'CRM avanzado + IA Comercial (500 créditos) + Automatizaciones + Campañas + Gmail/Outlook + Google/Outlook Calendar + Alegra Básico + Dashboard ejecutivo + Reportes avanzados'
WHERE code = 'pro';

UPDATE public.plans SET
  price       = 179900,
  description = 'Todo PRO + Pedidos + OTs + Evidencias + GPS + Mapa Operativo + Equipos + Portal Cliente + Customer Success + Loyalty + BI + Finanzas + Forecast + Drive + OneDrive + Teams + WhatsApp Business API + Alegra Avanzado + 1 Agente IA'
WHERE code = 'premium';

UPDATE public.plans SET
  description = 'CRM básico, Cotizaciones, PDF, Portal cotización, Dashboard básico, WhatsApp manual'
WHERE code = 'free';

-- ─── 2. Actualizar storage en plan_limits ────────────────────────────────────

-- PRO: 0 GB → 1 GB (nuevo beneficio incluido)
UPDATE public.plan_limits SET
  max_storage_gb = 1,
  updated_at = now()
WHERE plan_code = 'pro';

-- PREMIUM: 5 GB → 20 GB (incremento de beneficio)
UPDATE public.plan_limits SET
  max_storage_gb = 20,
  updated_at = now()
WHERE plan_code = 'premium';

-- FREE: storage = 0 (sin storage incluido)
-- Verificar que max_storage_gb sea NULL o 0 (sin storage efectivo)
UPDATE public.plan_limits SET
  max_storage_gb = NULL,   -- NULL = no incluye storage → check_evidence_quota devuelve 0
  updated_at = now()
WHERE plan_code = 'free';

-- ─── 3. Confirmar límites completos PRO (idempotente) ────────────────────────

UPDATE public.plan_limits SET
  max_quotes_month   = 1000,
  max_clients        = 2000,
  max_catalog_items  = 2000,
  included_users     = 1,
  extra_user_price   = 0,
  ai_credits_monthly = 500,
  max_storage_gb     = 1,
  updated_at         = now()
WHERE plan_code = 'pro';

-- ─── 4. Confirmar límites completos PREMIUM (idempotente) ────────────────────

UPDATE public.plan_limits SET
  max_quotes_month   = NULL,   -- ilimitado
  max_clients        = NULL,   -- ilimitado
  max_catalog_items  = NULL,   -- ilimitado
  included_users     = 5,
  extra_user_price   = 11900,
  ai_credits_monthly = 2000,
  max_storage_gb     = 20,
  updated_at         = now()
WHERE plan_code = 'premium';

-- ─── 5. Confirmar límites completos FREE (idempotente) ────────────────────────

UPDATE public.plan_limits SET
  max_quotes_month   = 50,
  max_clients        = 50,
  max_catalog_items  = 100,
  included_users     = 1,
  extra_user_price   = 0,
  ai_credits_monthly = 0,
  max_storage_gb     = NULL,
  updated_at         = now()
WHERE plan_code = 'free';

-- ─── 6. Confirmar features PRO (IA habilitada) ───────────────────────────────

UPDATE public.plan_features SET
  ai_enabled             = true,
  photo_quote_enabled    = false,
  templates_enabled      = true,
  branding_enabled       = true,
  custom_qr_enabled      = true,
  advanced_reports_enabled = true,
  multiuser_enabled      = false,
  pdf_tier               = 'pro',
  updated_at             = now()
WHERE plan_code = 'pro';

-- ─── 7. Confirmar features FREE (sin IA) ─────────────────────────────────────

UPDATE public.plan_features SET
  ai_enabled             = false,
  photo_quote_enabled    = false,
  templates_enabled      = false,
  branding_enabled       = false,
  custom_qr_enabled      = false,
  advanced_reports_enabled = false,
  multiuser_enabled      = false,
  pdf_tier               = 'free',
  updated_at             = now()
WHERE plan_code = 'free';

-- ─── 8. Confirmar features PREMIUM (todo habilitado) ─────────────────────────

UPDATE public.plan_features SET
  ai_enabled             = true,
  photo_quote_enabled    = true,
  templates_enabled      = true,
  branding_enabled       = true,
  custom_qr_enabled      = true,
  advanced_reports_enabled = true,
  multiuser_enabled      = true,
  pdf_tier               = 'pro',
  updated_at             = now()
WHERE plan_code = 'premium';

-- ─── 9. Comentario de auditoría ──────────────────────────────────────────────

COMMENT ON TABLE public.plan_limits IS
  'Sprint 24 v3: FREE 0cred/0GB, PRO 500cred/1GB/$59.900, PREMIUM 2000cred/20GB/$179.900, ENTERPRISE 5000cred/100GB/$399.900';
