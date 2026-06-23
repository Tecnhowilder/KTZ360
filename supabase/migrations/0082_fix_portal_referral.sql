-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0082: Fix get_portal_referral_info (corrige bug de program_id)
-- referral_links no tiene columna program_id — se eliminó del INSERT.
-- Aplicar en Supabase SQL Editor si ya se corrió 0081.
-- ════════════════════════════════════════════════════════════════════════════

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
    -- Generar código único con loop anti-colisión
    LOOP
      v_ref_code := substring(encode(gen_random_bytes(6), 'hex'), 1, 8);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM referral_links WHERE ref_code = v_ref_code);
    END LOOP;

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
