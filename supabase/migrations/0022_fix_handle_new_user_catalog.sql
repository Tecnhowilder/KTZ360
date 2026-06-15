-- KTZ360 — Corrige handle_new_user() (bug introducido en 0020)
-- Pegar manualmente en el editor SQL de Supabase ANTES de reintentar
-- 0021_seed_test_users.sql.
--
-- 0020 redefinió handle_new_user() copiando por error el bloque de sembrado
-- de catálogo antiguo (service_types/materials/service_materials), tablas
-- eliminadas en 0005 (el catálogo v2 es global, no se siembra por workspace).
-- Esto rompía CUALQUIER registro nuevo (no solo los de prueba) con el error
-- 42P01 "relation public.service_types does not exist".
--
-- Esta migración deja handle_new_user() igual a la lógica de invitación de
-- 0020 §1.0, pero sin el bloque de catálogo (consistente con 0005).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
  v_workspace_id uuid;
  v_free_plan_id uuid;
begin
  -- Caso invitación: si el email coincide con una invitación pendiente y
  -- vigente, vincular directamente al workspace destino y no crear nada más.
  select * into v_invitation
    from public.workspace_invitations
    where lower(email) = lower(new.email)
      and status = 'pending'
      and expires_at > now()
    order by created_at desc
    limit 1;

  if v_invitation.id is not null then
    insert into public.profiles (id, workspace_id, role, full_name, email, status)
    values (new.id, v_invitation.workspace_id, v_invitation.role,
            coalesce(new.raw_user_meta_data->>'full_name', ''), new.email, 'active');

    update public.workspace_invitations
      set status = 'accepted', accepted_at = now()
      where id = v_invitation.id;

    insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
    values (v_invitation.workspace_id, new.id, 'invite_accepted', 'workspace_invitations', v_invitation.id,
            jsonb_build_object('performed_by', new.id, 'email', new.email, 'role', v_invitation.role,
                                'old_value', null, 'new_value', v_invitation.role, 'timestamp', now()));

    return new;
  end if;

  -- Caso normal: registro nuevo, crea workspace independiente.
  insert into public.workspaces (name, type, currency_code, created_by)
  values (coalesce(new.raw_user_meta_data->>'company_name', 'Mi negocio'), 'independiente', 'COP', new.id)
  returning id into v_workspace_id;

  select id into v_free_plan_id from public.plans where code = 'free';
  update public.workspaces set current_plan_id = v_free_plan_id where id = v_workspace_id;

  insert into public.profiles (id, workspace_id, role, full_name, email)
  values (new.id, v_workspace_id, 'owner', coalesce(new.raw_user_meta_data->>'full_name', ''), new.email);

  insert into public.company_settings (workspace_id, name, email)
  values (v_workspace_id, coalesce(new.raw_user_meta_data->>'company_name', ''), new.email);

  insert into public.workspace_features (workspace_id)
  values (v_workspace_id);

  insert into public.subscriptions (workspace_id, plan_id, status)
  values (v_workspace_id, v_free_plan_id, 'active');

  return new;
end;
$$;
