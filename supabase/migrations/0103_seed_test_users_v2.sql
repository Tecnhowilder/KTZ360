-- ============================================================================
-- 0103 — seed_test_users_v2: Usuarios de prueba completos Sprint 24
-- ============================================================================
-- Contraseña TODOS los usuarios: Test1234!
--
-- WORKSPACES y USUARIOS:
--
--   [Super Admin]
--   superadmin@shelwi.test          → super_admin (workspace propio, sin uso operativo)
--
--   [FREE] Empresa Free - Test Shelwi
--   free.owner@shelwi.test          → owner, plan FREE
--
--   [PRO] Empresa Pro - Test Shelwi
--   pro.owner@shelwi.test           → owner, plan PRO
--   pro.comercial@shelwi.test       → comercial, plan PRO (mismo workspace)
--
--   [PREMIUM] Empresa Premium - Test Shelwi
--   premium.owner@shelwi.test       → owner, plan PREMIUM
--   premium.admin@shelwi.test       → admin, plan PREMIUM (mismo workspace)
--   premium.supervisor@shelwi.test  → supervisor, plan PREMIUM (mismo workspace)
--   premium.comercial@shelwi.test   → comercial, plan PREMIUM (mismo workspace)
--   premium.operario@shelwi.test    → operario, plan PREMIUM (mismo workspace)
--
--   [ENTERPRISE] Empresa Enterprise - Test Shelwi
--   enterprise.owner@shelwi.test    → owner, plan ENTERPRISE
--   enterprise.admin@shelwi.test    → admin, plan ENTERPRISE (mismo workspace)
--
-- Total: 11 usuarios | 5 workspaces
--
-- IDEMPOTENTE: puede ejecutarse varias veces sin duplicar datos.
-- Para limpiar: DELETE FROM auth.users WHERE email LIKE '%@shelwi.test';
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Helper: crear usuario en auth.users si no existe ────────────────────────

CREATE OR REPLACE FUNCTION public._seed_shelwi_user(
  p_email        text,
  p_full_name    text,
  p_company_name text,
  p_password     text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Idempotente: no duplicar si ya existe
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    RETURN v_user_id;
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'company_name', p_company_name),
    now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email',
    now(), now(), now()
  );

  RETURN v_user_id;
END;
$$;

-- ─── Seed principal ───────────────────────────────────────────────────────────

DO $$
DECLARE
  -- IDs de planes
  v_free_plan        uuid;
  v_pro_plan         uuid;
  v_premium_plan     uuid;
  v_enterprise_plan  uuid;

  -- IDs de usuarios
  v_superadmin_id    uuid;
  v_free_owner_id    uuid;
  v_pro_owner_id     uuid;
  v_premium_owner_id uuid;
  v_ent_owner_id     uuid;

  -- IDs de workspaces
  v_pro_ws           uuid;
  v_premium_ws       uuid;
  v_ent_ws           uuid;

BEGIN

  -- Obtener IDs de planes
  SELECT id INTO v_free_plan       FROM public.plans WHERE code = 'free';
  SELECT id INTO v_pro_plan        FROM public.plans WHERE code = 'pro';
  SELECT id INTO v_premium_plan    FROM public.plans WHERE code = 'premium';
  SELECT id INTO v_enterprise_plan FROM public.plans WHERE code = 'enterprise';

  -- ─── SUPER ADMIN ────────────────────────────────────────────────────────────

  v_superadmin_id := public._seed_shelwi_user(
    'superadmin@shelwi.test', 'Super Admin Shelwi', 'Shelwi Internal', 'Test1234!'
  );
  UPDATE public.profiles
  SET role = 'super_admin', updated_at = now()
  WHERE id = v_superadmin_id AND role != 'super_admin';

  -- ─── FREE OWNER ─────────────────────────────────────────────────────────────

  v_free_owner_id := public._seed_shelwi_user(
    'free.owner@shelwi.test', 'Owner FREE Test', 'Empresa Free - Test Shelwi', 'Test1234!'
  );
  -- Plan FREE ya es el default — no requiere update

  -- ─── PRO OWNER ──────────────────────────────────────────────────────────────

  v_pro_owner_id := public._seed_shelwi_user(
    'pro.owner@shelwi.test', 'Owner PRO Test', 'Empresa Pro - Test Shelwi', 'Test1234!'
  );
  IF v_pro_owner_id IS NOT NULL AND v_pro_plan IS NOT NULL THEN
    SELECT workspace_id INTO v_pro_ws
    FROM public.profiles WHERE id = v_pro_owner_id;

    UPDATE public.workspaces
    SET current_plan_id = v_pro_plan
    WHERE id = v_pro_ws;

    UPDATE public.subscriptions
    SET plan_id = v_pro_plan, status = 'active'
    WHERE workspace_id = v_pro_ws;

    -- Pre-crear invitación para comercial PRO
    INSERT INTO public.workspace_invitations
      (workspace_id, email, full_name, role, invited_by)
    VALUES
      (v_pro_ws, 'pro.comercial@shelwi.test', 'Comercial PRO Test', 'comercial', v_pro_owner_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Crear usuario comercial PRO (se vincula al workspace por la invitación)
  PERFORM public._seed_shelwi_user(
    'pro.comercial@shelwi.test', 'Comercial PRO Test', 'PRO Test', 'Test1234!'
  );

  -- ─── PREMIUM OWNER ──────────────────────────────────────────────────────────

  v_premium_owner_id := public._seed_shelwi_user(
    'premium.owner@shelwi.test', 'Owner PREMIUM Test', 'Empresa Premium - Test Shelwi', 'Test1234!'
  );
  IF v_premium_owner_id IS NOT NULL AND v_premium_plan IS NOT NULL THEN
    SELECT workspace_id INTO v_premium_ws
    FROM public.profiles WHERE id = v_premium_owner_id;

    UPDATE public.workspaces
    SET current_plan_id = v_premium_plan
    WHERE id = v_premium_ws;

    UPDATE public.subscriptions
    SET plan_id = v_premium_plan, status = 'active'
    WHERE workspace_id = v_premium_ws;

    -- Pre-crear invitaciones para todos los roles secundarios PREMIUM
    INSERT INTO public.workspace_invitations
      (workspace_id, email, full_name, role, invited_by)
    VALUES
      (v_premium_ws, 'premium.admin@shelwi.test',      'Admin PREMIUM Test',      'admin',      v_premium_owner_id),
      (v_premium_ws, 'premium.supervisor@shelwi.test',  'Supervisor PREMIUM Test', 'supervisor', v_premium_owner_id),
      (v_premium_ws, 'premium.comercial@shelwi.test',   'Comercial PREMIUM Test',  'comercial',  v_premium_owner_id),
      (v_premium_ws, 'premium.operario@shelwi.test',    'Operario PREMIUM Test',   'operario',   v_premium_owner_id)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Workspace ya existe (re-run): obtener workspace_id para las invitaciones
    SELECT workspace_id INTO v_premium_ws
    FROM public.profiles
    WHERE id = (SELECT id FROM auth.users WHERE email = 'premium.owner@shelwi.test');
  END IF;

  -- Crear usuarios secundarios PREMIUM (trigger los vincula por invitación)
  PERFORM public._seed_shelwi_user('premium.admin@shelwi.test',      'Admin PREMIUM Test',      'PREMIUM Test', 'Test1234!');
  PERFORM public._seed_shelwi_user('premium.supervisor@shelwi.test',  'Supervisor PREMIUM Test', 'PREMIUM Test', 'Test1234!');
  PERFORM public._seed_shelwi_user('premium.comercial@shelwi.test',   'Comercial PREMIUM Test',  'PREMIUM Test', 'Test1234!');
  PERFORM public._seed_shelwi_user('premium.operario@shelwi.test',    'Operario PREMIUM Test',   'PREMIUM Test', 'Test1234!');

  -- ─── ENTERPRISE OWNER ───────────────────────────────────────────────────────

  v_ent_owner_id := public._seed_shelwi_user(
    'enterprise.owner@shelwi.test', 'Owner ENTERPRISE Test', 'Empresa Enterprise - Test Shelwi', 'Test1234!'
  );
  IF v_ent_owner_id IS NOT NULL AND v_enterprise_plan IS NOT NULL THEN
    SELECT workspace_id INTO v_ent_ws
    FROM public.profiles WHERE id = v_ent_owner_id;

    UPDATE public.workspaces
    SET current_plan_id = v_enterprise_plan
    WHERE id = v_ent_ws;

    UPDATE public.subscriptions
    SET plan_id = v_enterprise_plan, status = 'active'
    WHERE workspace_id = v_ent_ws;

    -- Pre-crear invitación para admin ENTERPRISE
    INSERT INTO public.workspace_invitations
      (workspace_id, email, full_name, role, invited_by)
    VALUES
      (v_ent_ws, 'enterprise.admin@shelwi.test', 'Admin ENTERPRISE Test', 'admin', v_ent_owner_id)
    ON CONFLICT DO NOTHING;

  ELSIF v_enterprise_plan IS NULL THEN
    RAISE NOTICE '⚠️  Plan ENTERPRISE no encontrado en DB. Ejecuta primero 0097_enterprise_plan.sql. El usuario enterprise.owner se creó en plan FREE.';
    SELECT workspace_id INTO v_ent_ws
    FROM public.profiles WHERE id = v_ent_owner_id;

    -- Pre-crear invitación de todas formas
    IF v_ent_ws IS NOT NULL THEN
      INSERT INTO public.workspace_invitations
        (workspace_id, email, full_name, role, invited_by)
      VALUES
        (v_ent_ws, 'enterprise.admin@shelwi.test', 'Admin ENTERPRISE Test', 'admin', v_ent_owner_id)
      ON CONFLICT DO NOTHING;
    END IF;

  ELSE
    -- Re-run: workspace ya existe
    SELECT workspace_id INTO v_ent_ws
    FROM public.profiles
    WHERE id = (SELECT id FROM auth.users WHERE email = 'enterprise.owner@shelwi.test');

    IF v_ent_ws IS NOT NULL THEN
      INSERT INTO public.workspace_invitations
        (workspace_id, email, full_name, role, invited_by)
      VALUES
        (v_ent_ws, 'enterprise.admin@shelwi.test', 'Admin ENTERPRISE Test', 'admin',
          (SELECT id FROM public.profiles WHERE workspace_id = v_ent_ws AND role = 'owner' LIMIT 1))
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Crear usuario admin ENTERPRISE
  PERFORM public._seed_shelwi_user(
    'enterprise.admin@shelwi.test', 'Admin ENTERPRISE Test', 'ENTERPRISE Test', 'Test1234!'
  );

  RAISE NOTICE '✅ Usuarios de prueba Shelwi creados correctamente.';
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '  CONTRASEÑA TODOS: Test1234!';
  RAISE NOTICE '';
  RAISE NOTICE '  superadmin@shelwi.test       → super_admin';
  RAISE NOTICE '  free.owner@shelwi.test        → owner FREE';
  RAISE NOTICE '  pro.owner@shelwi.test         → owner PRO';
  RAISE NOTICE '  pro.comercial@shelwi.test     → comercial PRO';
  RAISE NOTICE '  premium.owner@shelwi.test     → owner PREMIUM';
  RAISE NOTICE '  premium.admin@shelwi.test     → admin PREMIUM';
  RAISE NOTICE '  premium.supervisor@shelwi.test→ supervisor PREMIUM';
  RAISE NOTICE '  premium.comercial@shelwi.test → comercial PREMIUM';
  RAISE NOTICE '  premium.operario@shelwi.test  → operario PREMIUM';
  RAISE NOTICE '  enterprise.owner@shelwi.test  → owner ENTERPRISE';
  RAISE NOTICE '  enterprise.admin@shelwi.test  → admin ENTERPRISE';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

END $$;

-- ─── Limpiar función helper ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public._seed_shelwi_user(text, text, text, text);

-- ─── Script de limpieza (ejecutar solo en desarrollo/QA) ─────────────────────
-- Para eliminar TODOS los usuarios de prueba y sus datos:
--
-- DELETE FROM auth.users WHERE email LIKE '%@shelwi.test';
-- (Los workspaces, profiles y datos se eliminan en cascada)
