-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0081: Portal Referidos (Sprint 17)
-- Extiende el portal del cliente con pestaña de referidos.
-- Función pública SECURITY DEFINER: valida token, retorna/crea ref link.
-- Zero Trust: workspace_id siempre derivado del portal_token, nunca del front.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── get_portal_referral_info ────────────────────────────────────────────────
-- Retorna el referral link del cliente si el workspace tiene programa activo.
-- Crea el link si no existe aún (idempotente).

CREATE OR REPLACE FUNCTION public.get_portal_referral_info(
  p_portal_token TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_workspace_id  UUID;
  v_client_id     UUID;
  v_program_row   referral_programs%ROWTYPE;
  v_link_row      referral_links%ROWTYPE;
  v_ref_code      TEXT;
  v_base_url      TEXT := current_setting('app.site_url', true);
BEGIN
  -- Validar token → workspace + client
  SELECT cs.workspace_id, cs.client_id
  INTO v_workspace_id, v_client_id
  FROM client_sessions cs
  WHERE cs.token = p_portal_token
    AND cs.expires_at > now()
    AND cs.revoked_at IS NULL
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    RETURN json_build_object('active', false, 'error', 'invalid_token');
  END IF;

  -- Verificar programa activo
  SELECT * INTO v_program_row
  FROM referral_programs rp
  WHERE rp.workspace_id = v_workspace_id
    AND rp.active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('active', false);
  END IF;

  -- Buscar link existente del cliente
  SELECT * INTO v_link_row
  FROM referral_links rl
  WHERE rl.workspace_id = v_workspace_id
    AND rl.client_id = v_client_id;

  IF NOT FOUND THEN
    -- Crear nuevo link
    v_ref_code := encode(gen_random_bytes(6), 'hex');
    INSERT INTO referral_links (workspace_id, client_id, ref_code)
    VALUES (v_workspace_id, v_client_id, v_ref_code)
    RETURNING * INTO v_link_row;
  ELSE
    v_ref_code := v_link_row.ref_code;
  END IF;

  RETURN json_build_object(
    'active',           true,
    'ref_code',         v_ref_code,
    'ref_url',          '/ref/' || v_ref_code,
    'visits',           v_link_row.visits_count,
    'conversions',      v_link_row.conversions_count,
    'referrer_points',  v_program_row.referrer_points,
    'referee_points',   v_program_row.referee_points,
    'program_name',     v_program_row.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_referral_info(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_portal_referral_info(TEXT)
  IS 'Portal público: retorna/crea referral link del cliente. Valida portal_token, deriva workspace del servidor.';
