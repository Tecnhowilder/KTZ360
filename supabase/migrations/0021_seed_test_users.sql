-- KTZ360 — Usuarios de prueba (roles + planes)
-- Pegar manualmente en el editor SQL de Supabase (requiere permisos sobre el
-- esquema auth, disponibles en el SQL Editor del dashboard).
--
-- Credenciales de todos los usuarios de prueba: contraseña = Test1234!
--
--   superadmin@ktz360.com     -> role 'super_admin' (su propio workspace, sin uso operativo)
--   owner@test.ktz360.com     -> role 'owner'    en "Workspace de Pruebas KTZ360" (plan PREMIUM)
--   admin@test.ktz360.com     -> role 'admin'    en "Workspace de Pruebas KTZ360" (plan PREMIUM)
--   employee@test.ktz360.com  -> role 'employee' en "Workspace de Pruebas KTZ360" (plan PREMIUM)
--   premium@test.ktz360.com   -> role 'owner' de su propio workspace, plan PREMIUM
--   pro@test.ktz360.com       -> role 'owner' de su propio workspace, plan PRO
--   free@test.ktz360.com      -> role 'owner' de su propio workspace, plan FREE
--
-- Resultado: 4 workspaces, 7 usuarios. admin@/employee@ NO crean workspace
-- propio: se les pre-crea una invitación 'pending' al workspace del owner de
-- pruebas ANTES de registrarlos, así el trigger handle_new_user (0020 §1.0)
-- los vincula directamente a ese workspace con su rol — sin workspace huérfano.
--
-- Idempotente: se puede volver a ejecutar sin duplicar usuarios ni datos.
-- Para eliminar todo el set de prueba al finalizar QA, usar
-- 0021_seed_test_users_cleanup.sql.

create extension if not exists pgcrypto;

-- ============================================================================
-- Helper temporal: crea el usuario en auth.users (+identity) si no existe.
-- El trigger handle_new_user (0002/0020) crea automáticamente su workspace,
-- profile (owner), catálogo y suscripción free al insertar en auth.users —
-- salvo que ya exista una invitación 'pending' vigente para ese email, en
-- cuyo caso lo vincula directamente al workspace invitado (0020 §1.0).
-- Devuelve null si el usuario ya existía (no se reprocesa).
-- ============================================================================
create or replace function public._seed_test_user(p_email text, p_full_name text, p_company_name text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid;
begin
  if exists (select 1 from auth.users where email = p_email) then
    return null;
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'company_name', p_company_name),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email', now(), now(), now()
  );

  return v_user_id;
end;
$$;

-- ============================================================================
-- Crear usuarios y ajustar roles/planes
-- ============================================================================
do $$
declare
  v_superadmin_id uuid;
  v_owner_id uuid;
  v_admin_id uuid;
  v_employee_id uuid;
  v_premium_id uuid;
  v_free_id uuid;
  v_pro_id uuid;
  v_owner_ws uuid;
  v_premium_ws uuid;
  v_pro_ws uuid;
  v_premium_plan uuid;
  v_pro_plan uuid;
begin
  select id into v_premium_plan from public.plans where code = 'premium';
  select id into v_pro_plan     from public.plans where code = 'pro';

  -- super admin (workspace propio, sin uso operativo)
  v_superadmin_id := public._seed_test_user('superadmin@ktz360.com', 'Super Admin KTZ360', 'KTZ360 Internal', 'Test1234!');
  if v_superadmin_id is not null then
    update public.profiles set role = 'super_admin' where id = v_superadmin_id;
  end if;

  -- owner del workspace de pruebas
  v_owner_id := public._seed_test_user('owner@test.ktz360.com', 'Usuario Owner', 'Workspace de Pruebas KTZ360', 'Test1234!');
  if v_owner_id is not null then
    select workspace_id into v_owner_ws from public.profiles where id = v_owner_id;

    -- Workspace del owner de pruebas -> plan PREMIUM (requerido para multiusuario)
    update public.workspaces set current_plan_id = v_premium_plan where id = v_owner_ws;
    update public.subscriptions set plan_id = v_premium_plan where workspace_id = v_owner_ws;

    -- Pre-crear invitaciones 'pending' para admin@/employee@: el trigger
    -- handle_new_user los vinculará directamente a este workspace sin crear
    -- workspaces propios.
    insert into public.workspace_invitations (workspace_id, email, full_name, role, invited_by)
    values
      (v_owner_ws, 'admin@test.ktz360.com', 'Usuario Admin', 'admin', v_owner_id),
      (v_owner_ws, 'employee@test.ktz360.com', 'Usuario Employee', 'employee', v_owner_id)
    on conflict do nothing;
  else
    select workspace_id into v_owner_ws from public.profiles where id = (select id from auth.users where email = 'owner@test.ktz360.com');
  end if;

  -- admin@ y employee@: si hay invitación 'pending' vigente, el trigger los
  -- vincula directo al workspace del owner con su rol (admin/employee).
  v_admin_id    := public._seed_test_user('admin@test.ktz360.com', 'Usuario Admin', 'Admin Test', 'Test1234!');
  v_employee_id := public._seed_test_user('employee@test.ktz360.com', 'Usuario Employee', 'Employee Test', 'Test1234!');

  -- premium@ -> su propio workspace en plan PREMIUM
  v_premium_id := public._seed_test_user('premium@test.ktz360.com', 'Usuario Premium', 'Premium Test', 'Test1234!');
  if v_premium_id is not null then
    select workspace_id into v_premium_ws from public.profiles where id = v_premium_id;
    update public.workspaces set current_plan_id = v_premium_plan where id = v_premium_ws;
    update public.subscriptions set plan_id = v_premium_plan where workspace_id = v_premium_ws;
  end if;

  -- pro@ -> su propio workspace en plan PRO
  v_pro_id := public._seed_test_user('pro@test.ktz360.com', 'Usuario Pro', 'Pro Test', 'Test1234!');
  if v_pro_id is not null then
    select workspace_id into v_pro_ws from public.profiles where id = v_pro_id;
    update public.workspaces set current_plan_id = v_pro_plan where id = v_pro_ws;
    update public.subscriptions set plan_id = v_pro_plan where workspace_id = v_pro_ws;
  end if;

  -- free@ -> su propio workspace, conserva el plan FREE asignado por defecto
  v_free_id := public._seed_test_user('free@test.ktz360.com', 'Usuario Free', 'Free Test', 'Test1234!');
end $$;

drop function public._seed_test_user(text, text, text, text);
