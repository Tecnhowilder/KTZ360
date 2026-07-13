-- KTZ360 — Limpieza de usuarios de prueba (rollback de 0021_seed_test_users.sql)
-- Pegar manualmente en el editor SQL de Supabase cuando termine el QA.
--
-- Elimina los 4 workspaces de prueba (cascada: profiles, quotes, clientes,
-- materiales, audit_log, etc. de esos workspaces) y luego los 7 usuarios de
-- auth.users (cascada: profiles e identities restantes).
--
-- No afecta ningún otro workspace/usuario del sistema.

do $$
declare
  v_emails text[] := array[
    'superadmin@ktz360.com',
    'owner@test.ktz360.com',
    'admin@test.ktz360.com',
    'employee@test.ktz360.com',
    'premium@test.ktz360.com',
    'pro@test.ktz360.com',
    'free@test.ktz360.com'
  ];
begin
  -- Invitaciones pendientes/aceptadas asociadas a estos correos
  delete from public.workspace_invitations where lower(email) = any(v_emails);

  -- Workspaces de los usuarios de prueba (cascada sobre todas sus tablas hijas)
  delete from public.workspaces where id in (
    select workspace_id from public.profiles
    where id in (select id from auth.users where email = any(v_emails))
  );

  -- Usuarios de autenticación (cascada sobre profiles/identities remanentes)
  delete from auth.users where email = any(v_emails);
end $$;
