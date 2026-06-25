-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0103: Hotfix Portal Público — HTTP 400 en enlaces de cotización
-- ════════════════════════════════════════════════════════════════════════════
-- Causa raíz: migración 0019 NO fue aplicada en producción.
-- quote_access_tokens no tiene columna expires_at.
-- get_public_quote filtra AND t.expires_at > now() → columna no existe → 400.
--
-- Plazos acordados:
--   quote_access_tokens (enlace público cotización): 90 días
--   client_portal_tokens (portal cliente): 365 días — sin cambio
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Manejar expires_at (columna puede o no existir) ─────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'quote_access_tokens'
      AND column_name  = 'expires_at'
  ) THEN
    -- Columna no existe: agregar con default 90 días.
    -- PostgreSQL rellena todas las filas existentes con el DEFAULT automáticamente.
    ALTER TABLE public.quote_access_tokens
      ADD COLUMN expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days';

  ELSE
    -- Columna existe con default antiguo (7 días de migr 0019).
    -- Reactivar tokens vencidos de cotizaciones creadas en los últimos 90 días.
    UPDATE public.quote_access_tokens
    SET expires_at = created_at + interval '90 days'
    WHERE expires_at < now()
      AND created_at > now() - interval '90 days';

    -- Cambiar default de 7 días → 90 días para tokens nuevos.
    ALTER TABLE public.quote_access_tokens
      ALTER COLUMN expires_at SET DEFAULT now() + interval '90 days';
  END IF;
END;
$$;

-- ─── Step 2: get_public_quote robusta ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_public_quote(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result       jsonb;
  v_ip         text;
  v_bucket_key text;
  v_rl_exists  boolean;
BEGIN
  -- Rate limiting condicional (activo si migr 0102 fue aplicada)
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_portal_rate_limit'
  ) INTO v_rl_exists;

  IF v_rl_exists THEN
    v_ip         := public.get_client_ip();
    v_bucket_key := 'quote:' || p_token::text || ':' || split_part(v_ip, ',', 1);
    IF NOT public.check_portal_rate_limit(v_bucket_key, 20) THEN
      RAISE EXCEPTION 'rate_limit_exceeded'
        USING HINT = 'Demasiadas solicitudes. Intenta en 1 minuto.';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'quote',   to_jsonb(q) - 'workspace_id' - 'created_by',
    'client',  to_jsonb(c) - 'workspace_id' - 'created_by',
    'company', to_jsonb(cs) - 'workspace_id',
    'consent_status', (
      SELECT status FROM public.client_consents
      WHERE client_id = q.client_id ORDER BY created_at DESC LIMIT 1
    ),
    'consent_accepted_at', (
      SELECT accepted_at FROM public.client_consents
      WHERE client_id = q.client_id AND status = 'accepted'
      ORDER BY created_at DESC LIMIT 1
    ),
    'pdf_tier', (
      SELECT pf.pdf_tier FROM public.plan_features pf
      WHERE pf.plan_code = public.get_effective_plan_code(q.workspace_id)
    ),
    'custom_qr_enabled', public.check_feature_access(q.workspace_id, 'custom_qr_enabled')
  ) INTO result
  FROM public.quote_access_tokens t
  JOIN public.quotes q ON q.id = t.quote_id AND q.deleted_at IS NULL
  LEFT JOIN public.clients c ON c.id = q.client_id
  LEFT JOIN public.company_settings cs ON cs.workspace_id = q.workspace_id
  WHERE t.token = p_token
    AND t.expires_at > now();

  IF result IS NULL THEN
    RAISE EXCEPTION 'token_expired_or_not_found';
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_quote(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_quote(uuid) IS
  'Hotfix 0103: enlaces de cotización duran 90 días. Idempotente: funciona con o sin migr 0019.';
