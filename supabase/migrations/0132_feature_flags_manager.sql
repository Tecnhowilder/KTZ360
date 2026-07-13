-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0132: feature_flags_manager — Feature Flags dinámicos
-- ════════════════════════════════════════════════════════════════════════════
-- Propósito:
--   Capa 2 del sistema de features. Capa 1 = plan_features (por plan).
--   Capa 2 = feature_flags (runtime, workspace/user/rollout targeting).
--
-- Casos de uso:
--   • Habilitar una feature para un workspace específico sin cambiar su plan
--   • Rollout gradual por porcentaje (canary deploy)
--   • Beta features solo para ciertos roles
--   • Desactivar una feature globalmente sin deploy de código
--
-- Zero Trust:
--   • workspace_id SIEMPRE del JWT (via profiles)
--   • Lectura solo via RPC autenticada — no SELECT directo
--   • Escritura solo via RPC is_super_admin()
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabla feature_flags ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  description   text,
  enabled       boolean     NOT NULL DEFAULT false,

  -- Scopes de targeting (null = no aplica ese filtro)
  plan_codes    text[],           -- ['pro','premium'] — null = todos los planes
  workspace_ids uuid[],           -- override para workspaces específicos
  user_ids      uuid[],           -- override para usuarios específicos
  roles         text[],           -- ['owner','admin'] — null = todos los roles

  -- Rollout gradual (0-100, null = 100%)
  rollout_pct   smallint    CHECK (rollout_pct IS NULL OR (rollout_pct >= 0 AND rollout_pct <= 100)),

  -- Metadatos
  category      text        NOT NULL DEFAULT 'general'
                            CHECK (category IN ('ui','ai','ops','billing','push','email','security','general')),
  tags          text[]      NOT NULL DEFAULT '{}',

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key
  ON public.feature_flags (key);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled
  ON public.feature_flags (enabled) WHERE enabled = true;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Super/support admin pueden leer todos los flags
CREATE POLICY "feature_flags_select_admin"
  ON public.feature_flags FOR SELECT
  USING (public.is_support_admin());

-- Solo super_admin puede escribir (vía RPC — esta policy es defensa en profundidad)
CREATE POLICY "feature_flags_insert_super"
  ON public.feature_flags FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY "feature_flags_update_super"
  ON public.feature_flags FOR UPDATE
  USING (public.is_super_admin());

CREATE POLICY "feature_flags_delete_super"
  ON public.feature_flags FOR DELETE
  USING (public.is_super_admin());

-- ─── 2. RPC: is_dynamic_flag_enabled ─────────────────────────────────────────
-- Evalúa si un flag dinámico está activo para el usuario/workspace actual.
-- Lógica de evaluación (prioridad en orden):
--   1. Flag no existe → false
--   2. workspace_ids override → true si workspace en lista (ignora enabled)
--   3. user_ids override → true si usuario en lista (ignora enabled)
--   4. enabled=false → false
--   5. plan_codes filter → false si plan del workspace no está en lista
--   6. roles filter → false si role del usuario no está en lista
--   7. rollout_pct → false si hash(workspace_id + key) % 100 >= pct
--   8. → true

CREATE OR REPLACE FUNCTION public.is_dynamic_flag_enabled(p_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag       record;
  v_user_id    uuid := auth.uid();
  v_ws_id      uuid;
  v_plan_code  text;
  v_role       text;
  v_hash_val   int;
BEGIN
  IF v_user_id IS NULL THEN RETURN false; END IF;

  SELECT workspace_id, role INTO v_ws_id, v_role
    FROM public.profiles WHERE id = v_user_id;

  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_flag FROM public.feature_flags WHERE key = p_key;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Workspace override (whitelist — activo aunque enabled=false)
  IF v_flag.workspace_ids IS NOT NULL AND cardinality(v_flag.workspace_ids) > 0 THEN
    IF v_ws_id = ANY(v_flag.workspace_ids) THEN RETURN true; END IF;
  END IF;

  -- User override (whitelist — activo aunque enabled=false)
  IF v_flag.user_ids IS NOT NULL AND cardinality(v_flag.user_ids) > 0 THEN
    IF v_user_id = ANY(v_flag.user_ids) THEN RETURN true; END IF;
  END IF;

  -- Master switch
  IF NOT v_flag.enabled THEN RETURN false; END IF;

  -- Plan filter
  IF v_flag.plan_codes IS NOT NULL AND cardinality(v_flag.plan_codes) > 0 THEN
    v_plan_code := public.get_effective_plan_code(v_ws_id);
    IF v_plan_code IS NULL OR NOT (v_plan_code = ANY(v_flag.plan_codes)) THEN
      RETURN false;
    END IF;
  END IF;

  -- Role filter
  IF v_flag.roles IS NOT NULL AND cardinality(v_flag.roles) > 0 THEN
    IF v_role IS NULL OR NOT (v_role = ANY(v_flag.roles)) THEN
      RETURN false;
    END IF;
  END IF;

  -- Rollout porcentual (determinístico por workspace)
  IF v_flag.rollout_pct IS NOT NULL AND v_flag.rollout_pct < 100 THEN
    v_hash_val := abs(hashtext(v_ws_id::text || '|' || p_key)) % 100;
    IF v_hash_val >= v_flag.rollout_pct THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_dynamic_flag_enabled(text) TO authenticated;

-- ─── 3. RPC: get_all_dynamic_flags ────────────────────────────────────────────
-- Devuelve todos los flags con su evaluación para el contexto actual.
-- Útil para cargar todos los flags en una sola llamada desde el frontend.

CREATE OR REPLACE FUNCTION public.get_all_dynamic_flags()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ws_id   uuid;
  v_result  jsonb := '{}'::jsonb;
  v_flag    record;
BEGIN
  IF v_user_id IS NULL THEN RETURN v_result; END IF;

  SELECT workspace_id INTO v_ws_id FROM public.profiles WHERE id = v_user_id;

  FOR v_flag IN SELECT key FROM public.feature_flags LOOP
    v_result := v_result || jsonb_build_object(
      v_flag.key, public.is_dynamic_flag_enabled(v_flag.key)
    );
  END LOOP;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_dynamic_flags() TO authenticated;

-- ─── 4. RPC: admin_list_feature_flags ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_feature_flags()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requires_support_admin');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', (
      SELECT jsonb_agg(row_to_json(f) ORDER BY f.category, f.key)
        FROM public.feature_flags f
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_feature_flags() TO authenticated;

-- ─── 5. RPC: admin_upsert_feature_flag ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_upsert_feature_flag(
  p_key           text,
  p_name          text,
  p_description   text         DEFAULT NULL,
  p_enabled       boolean      DEFAULT false,
  p_plan_codes    text[]       DEFAULT NULL,
  p_workspace_ids uuid[]       DEFAULT NULL,
  p_user_ids      uuid[]       DEFAULT NULL,
  p_roles         text[]       DEFAULT NULL,
  p_rollout_pct   smallint     DEFAULT NULL,
  p_category      text         DEFAULT 'general',
  p_tags          text[]       DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id    uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  END IF;

  INSERT INTO public.feature_flags
    (key, name, description, enabled, plan_codes, workspace_ids, user_ids,
     roles, rollout_pct, category, tags, created_by, updated_by)
  VALUES
    (p_key, p_name, p_description, p_enabled, p_plan_codes, p_workspace_ids,
     p_user_ids, p_roles, p_rollout_pct, p_category, coalesce(p_tags,'{}'),
     v_actor, v_actor)
  ON CONFLICT (key) DO UPDATE SET
    name          = excluded.name,
    description   = excluded.description,
    enabled       = excluded.enabled,
    plan_codes    = excluded.plan_codes,
    workspace_ids = excluded.workspace_ids,
    user_ids      = excluded.user_ids,
    roles         = excluded.roles,
    rollout_pct   = excluded.rollout_pct,
    category      = excluded.category,
    tags          = excluded.tags,
    updated_at    = now(),
    updated_by    = v_actor
  RETURNING id INTO v_id;

  PERFORM public.admin_audit(
    'feature_flag_upserted', 'feature_flags', p_key,
    jsonb_build_object('key', p_key, 'enabled', p_enabled, 'category', p_category)
  );

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_feature_flag(
  text, text, text, boolean, text[], uuid[], uuid[], text[], smallint, text, text[]
) TO authenticated;

-- ─── 6. RPC: admin_toggle_feature_flag ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_toggle_feature_flag(p_key text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  END IF;

  UPDATE public.feature_flags
     SET enabled = p_enabled, updated_at = now(), updated_by = auth.uid()
   WHERE key = p_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'flag_not_found');
  END IF;

  PERFORM public.admin_audit(
    'feature_flag_toggled', 'feature_flags', p_key,
    jsonb_build_object('key', p_key, 'enabled', p_enabled)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_feature_flag(text, boolean) TO authenticated;

-- ─── 7. RPC: admin_delete_feature_flag ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_delete_feature_flag(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  END IF;

  DELETE FROM public.feature_flags WHERE key = p_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'flag_not_found');
  END IF;

  PERFORM public.admin_audit(
    'feature_flag_deleted', 'feature_flags', p_key,
    jsonb_build_object('key', p_key)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_feature_flag(text) TO authenticated;

-- ─── 8. Flags iniciales del sistema ───────────────────────────────────────────
-- Flags de ejemplo para nuevas funcionalidades en desarrollo.

INSERT INTO public.feature_flags (key, name, description, enabled, category, tags)
VALUES
  ('new_dashboard_v2',      'Dashboard V2',         'Nuevo dashboard con gráficos avanzados', false, 'ui',      '{beta}'),
  ('ai_agents_beta',        'Agentes IA Beta',       'Agentes autónomos IA — beta cerrado',   false, 'ai',      '{beta,ai}'),
  ('push_campaigns',        'Campañas Push',         'Envío masivo de push notifications',    false, 'push',    '{marketing}'),
  ('advanced_audit',        'Auditoría Avanzada',    'Logs de auditoría con más detalle',     false, 'security','{enterprise}'),
  ('workspace_analytics',   'Analytics Workspace',   'Dashboard de analytics por workspace',  false, 'ui',      '{pro,premium}'),
  ('ai_document_analysis',  'Análisis IA Documentos','Análisis de documentos con IA',         false, 'ai',      '{premium}')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.feature_flags
  IS 'Capa 2 del sistema de features: flags dinámicos con targeting (workspace/user/plan/rol/rollout). Capa 1 = plan_features (por plan).';
