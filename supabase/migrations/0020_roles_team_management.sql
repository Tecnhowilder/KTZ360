-- KTZ360 — Matriz oficial de roles + Módulo "Equipo y Usuarios" (Premium)
-- + Invitaciones (Resend). No ejecutar automáticamente: pegar manualmente
-- en el editor SQL de Supabase.

-- ============================================================================
-- 1.1 Helper de rol: is_owner()
-- ============================================================================
create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$ select public.current_user_role() = 'owner'; $$;

grant execute on function public.is_owner() to authenticated;

-- ============================================================================
-- 1.1-bis Formalizar límites del plan PREMIUM (idempotente)
-- ============================================================================
update public.plan_features set multiuser_enabled = true
  where plan_code = 'premium';

update public.plan_limits set included_users = 5, extra_user_price = 11999
  where plan_code = 'premium';

-- ============================================================================
-- Ampliar system_configuration.resend con from_email/from_name (idempotente)
-- ============================================================================
update public.system_configuration
  set value = value || jsonb_build_object(
    'from_email', coalesce(value->>'from_email', ''),
    'from_name', coalesce(value->>'from_name', '')
  )
  where key = 'resend';

-- ============================================================================
-- 1.2 profiles: estados de usuario + current_workspace_id() filtrado por status
-- ============================================================================
alter table public.profiles
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive', 'invited', 'removed'));

create or replace function public.current_workspace_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select workspace_id from public.profiles where id = auth.uid() and status = 'active';
$$;

-- ============================================================================
-- 1.3 company_settings: solo OWNER puede escribir (antes owner+admin)
-- ============================================================================
drop policy if exists "company_settings_write_admin" on public.company_settings;

create policy "company_settings_write_owner" on public.company_settings
  for all to authenticated
  using (workspace_id = public.current_workspace_id() and public.is_owner())
  with check (workspace_id = public.current_workspace_id() and public.is_owner());

-- ============================================================================
-- 1.4 workspace_invitations
-- ============================================================================
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null check (role in ('admin', 'employee')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

create unique index uq_pending_invite on public.workspace_invitations (workspace_id, lower(email))
  where status = 'pending';

create index idx_workspace_invitations_workspace on public.workspace_invitations (workspace_id);
create index idx_workspace_invitations_token on public.workspace_invitations (token);

alter table public.workspace_invitations enable row level security;

create policy "workspace_invitations_select_owner" on public.workspace_invitations
  for select to authenticated
  using (workspace_id = public.current_workspace_id() and public.is_owner());

create policy "workspace_invitations_update_owner" on public.workspace_invitations
  for update to authenticated
  using (workspace_id = public.current_workspace_id() and public.is_owner())
  with check (workspace_id = public.current_workspace_id() and public.is_owner());

create policy "workspace_invitations_select_support_admin" on public.workspace_invitations
  for select to authenticated
  using (public.is_support_admin());

-- ============================================================================
-- 1.5 additional_user_licenses (modelo de facturación futura, sin cobro real)
-- ============================================================================
create table public.additional_user_licenses (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  unit_price numeric(12, 2) not null default 11999,
  updated_at timestamptz not null default now()
);

alter table public.additional_user_licenses enable row level security;

create policy "additional_user_licenses_owner" on public.additional_user_licenses
  for all to authenticated
  using (workspace_id = public.current_workspace_id() and public.is_owner())
  with check (workspace_id = public.current_workspace_id() and public.is_owner());

-- ============================================================================
-- 1.6-bis Auditoría visible para SUPPORT_ADMIN (solo lectura)
-- ============================================================================
create policy "audit_log_select_support_admin" on public.audit_log
  for select to authenticated
  using (public.is_support_admin());

-- ============================================================================
-- 1.8 Preparación multi-sede (futuro, sin implementación de UI/permisos)
-- ============================================================================
alter table public.workspaces
  add column if not exists future_support_multibranch boolean not null default false;

-- ============================================================================
-- 1.0 handle_new_user(): si el email coincide con una invitación pendiente y
-- vigente, vincula directamente al workspace destino sin crear workspace ni
-- catálogo nuevos.
-- ============================================================================
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

  -- Caso normal: registro nuevo, crea workspace independiente + catálogo.
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

-- ============================================================================
-- compute_team_seats(): cálculo interno de cupos (sin verificación de permisos)
-- ============================================================================
create or replace function public.compute_team_seats(p_workspace_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_plan_code text;
  v_multiuser boolean;
  v_included_users int;
  v_extra_price numeric;
  v_additional_qty int;
  v_active_members int;
  v_pending_invites int;
begin
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  select pf.multiuser_enabled into v_multiuser
    from public.plan_features pf where pf.plan_code = v_plan_code;

  select pl.included_users, pl.extra_user_price into v_included_users, v_extra_price
    from public.plan_limits pl where pl.plan_code = v_plan_code;

  select coalesce(quantity, 0) into v_additional_qty
    from public.additional_user_licenses where workspace_id = p_workspace_id;

  select count(*) into v_active_members
    from public.profiles where workspace_id = p_workspace_id and status in ('active', 'inactive');

  select count(*) into v_pending_invites
    from public.workspace_invitations where workspace_id = p_workspace_id and status = 'pending';

  v_additional_qty := coalesce(v_additional_qty, 0);

  return jsonb_build_object(
    'plan_code', v_plan_code,
    'multiuser_enabled', coalesce(v_multiuser, false),
    'included_users', coalesce(v_included_users, 1),
    'extra_user_price', coalesce(v_extra_price, 0),
    'additional_licenses', v_additional_qty,
    'active_members', v_active_members,
    'pending_invites', v_pending_invites,
    'seats_used', v_active_members + v_pending_invites,
    'seats_limit', case when coalesce(v_multiuser, false)
      then coalesce(v_included_users, 1) + v_additional_qty
      else 1 end
  );
end;
$$;

grant execute on function public.compute_team_seats(uuid) to authenticated;

-- ============================================================================
-- 1.6-ter expire_stale_invitations(): expiración perezosa (sin cron)
-- ============================================================================
create or replace function public.expire_stale_invitations(p_workspace_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.workspace_invitations
    set status = 'expired'
    where workspace_id = p_workspace_id
      and status = 'pending'
      and expires_at <= now();
end;
$$;

grant execute on function public.expire_stale_invitations(uuid) to authenticated;

-- ============================================================================
-- get_team_seats(): cupos de equipo (owner / super_admin)
-- ============================================================================
create or replace function public.get_team_seats(p_workspace_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_super_admin() then
    null;
  elsif public.is_owner() and p_workspace_id = public.current_workspace_id() then
    null;
  else
    raise exception 'forbidden';
  end if;

  perform public.expire_stale_invitations(p_workspace_id);

  return public.compute_team_seats(p_workspace_id);
end;
$$;

grant execute on function public.get_team_seats(uuid) to authenticated;

-- ============================================================================
-- invite_team_member()
-- ============================================================================
create or replace function public.invite_team_member(
  p_workspace_id uuid,
  p_email text,
  p_role text,
  p_full_name text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_seats jsonb;
  v_invitation public.workspace_invitations;
  v_existing_profile uuid;
begin
  if not (public.is_super_admin() or (public.is_owner() and p_workspace_id = public.current_workspace_id())) then
    insert into public.audit_log (workspace_id, user_id, action, entity_type, metadata)
    values (p_workspace_id, auth.uid(), 'access_denied', 'workspace_invitations',
      jsonb_build_object('performed_by', auth.uid(), 'reason', 'invite_team_member', 'timestamp', now()));
    raise exception 'forbidden';
  end if;

  if not public.check_feature_access(p_workspace_id, 'multiuser_enabled') then
    raise exception 'feature_not_available: multiuser_enabled';
  end if;

  if p_role not in ('admin', 'employee') then
    raise exception 'invalid_role';
  end if;

  perform public.expire_stale_invitations(p_workspace_id);

  v_seats := public.compute_team_seats(p_workspace_id);
  if (v_seats->>'seats_used')::int >= (v_seats->>'seats_limit')::int then
    raise exception 'seat_limit_exceeded';
  end if;

  select id into v_existing_profile from public.profiles
    where workspace_id = p_workspace_id and lower(email) = lower(p_email) and status in ('active', 'inactive');
  if v_existing_profile is not null then
    raise exception 'user_already_member';
  end if;

  if exists (
    select 1 from public.workspace_invitations
    where workspace_id = p_workspace_id and lower(email) = lower(p_email) and status = 'pending'
  ) then
    raise exception 'invitation_already_pending';
  end if;

  insert into public.workspace_invitations (workspace_id, email, full_name, role, invited_by)
  values (p_workspace_id, lower(p_email), p_full_name, p_role, auth.uid())
  returning * into v_invitation;

  insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (p_workspace_id, auth.uid(), 'invite_sent', 'workspace_invitations', v_invitation.id,
    jsonb_build_object('performed_by', auth.uid(), 'email', v_invitation.email, 'role', v_invitation.role,
                        'old_value', null, 'new_value', v_invitation.role, 'timestamp', now()));

  return to_jsonb(v_invitation);
end;
$$;

grant execute on function public.invite_team_member(uuid, text, text, text) to authenticated;

-- ============================================================================
-- revoke_invitation()
-- ============================================================================
create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.workspace_invitations;
begin
  select * into v_inv from public.workspace_invitations where id = p_invitation_id;
  if v_inv.id is null then raise exception 'not_found'; end if;

  if not (public.is_super_admin() or (public.is_owner() and v_inv.workspace_id = public.current_workspace_id())) then
    raise exception 'forbidden';
  end if;

  perform public.expire_stale_invitations(v_inv.workspace_id);
  select * into v_inv from public.workspace_invitations where id = p_invitation_id;

  if v_inv.status <> 'pending' then raise exception 'invitation_not_pending'; end if;

  update public.workspace_invitations set status = 'revoked' where id = p_invitation_id;

  insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_inv.workspace_id, auth.uid(), 'invite_revoked', 'workspace_invitations', v_inv.id,
    jsonb_build_object('performed_by', auth.uid(), 'email', v_inv.email,
                        'old_value', 'pending', 'new_value', 'revoked', 'timestamp', now()));
end;
$$;

grant execute on function public.revoke_invitation(uuid) to authenticated;

-- ============================================================================
-- resend_invitation()
-- ============================================================================
create or replace function public.resend_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.workspace_invitations;
begin
  select * into v_inv from public.workspace_invitations where id = p_invitation_id;
  if v_inv.id is null then raise exception 'not_found'; end if;

  if not (public.is_super_admin() or (public.is_owner() and v_inv.workspace_id = public.current_workspace_id())) then
    raise exception 'forbidden';
  end if;

  perform public.expire_stale_invitations(v_inv.workspace_id);
  select * into v_inv from public.workspace_invitations where id = p_invitation_id;

  if v_inv.status <> 'pending' then raise exception 'invitation_not_pending'; end if;

  update public.workspace_invitations
    set expires_at = now() + interval '7 days'
    where id = p_invitation_id
    returning * into v_inv;

  insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_inv.workspace_id, auth.uid(), 'invite_sent', 'workspace_invitations', v_inv.id,
    jsonb_build_object('performed_by', auth.uid(), 'email', v_inv.email, 'role', v_inv.role,
                        'old_value', null, 'new_value', v_inv.role, 'timestamp', now(), 'resend', true));

  return to_jsonb(v_inv);
end;
$$;

grant execute on function public.resend_invitation(uuid) to authenticated;

-- ============================================================================
-- get_invitation_preview(): pública, para /invite/:token antes de iniciar sesión
-- ============================================================================
create or replace function public.get_invitation_preview(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.workspace_invitations;
  v_workspace_name text;
begin
  select * into v_inv from public.workspace_invitations where token = p_token;
  if v_inv.id is null then raise exception 'not_found'; end if;

  if v_inv.status = 'pending' and v_inv.expires_at <= now() then
    update public.workspace_invitations set status = 'expired' where id = v_inv.id;
    v_inv.status := 'expired';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'invalid_or_expired_invitation';
  end if;

  select name into v_workspace_name from public.workspaces where id = v_inv.workspace_id;

  return jsonb_build_object(
    'email', v_inv.email,
    'role', v_inv.role,
    'workspace_name', v_workspace_name,
    'status', v_inv.status,
    'expires_at', v_inv.expires_at
  );
end;
$$;

grant execute on function public.get_invitation_preview(uuid) to anon, authenticated;

-- ============================================================================
-- accept_invitation(): caso residual — usuario ya autenticado con workspace
-- propio que acepta una invitación a otro workspace.
-- ============================================================================
create or replace function public.accept_invitation(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.workspace_invitations;
  v_seats jsonb;
  v_caller_email text;
  v_workspace_name text;
  v_old_role text;
begin
  select * into v_inv from public.workspace_invitations where token = p_token;
  if v_inv.id is null then raise exception 'not_found'; end if;

  if v_inv.status = 'pending' and v_inv.expires_at <= now() then
    update public.workspace_invitations set status = 'expired' where id = v_inv.id;
    v_inv.status := 'expired';
  end if;

  if v_inv.status <> 'pending' then raise exception 'invalid_or_expired_invitation'; end if;

  select email into v_caller_email from auth.users where id = auth.uid();
  if v_caller_email is null or lower(v_caller_email) <> lower(v_inv.email) then
    raise exception 'email_mismatch';
  end if;

  perform public.expire_stale_invitations(v_inv.workspace_id);
  v_seats := public.compute_team_seats(v_inv.workspace_id);
  if (v_seats->>'seats_used')::int >= (v_seats->>'seats_limit')::int then
    raise exception 'seat_limit_exceeded';
  end if;

  select role into v_old_role from public.profiles where id = auth.uid();

  update public.profiles
    set workspace_id = v_inv.workspace_id, role = v_inv.role, status = 'active'
    where id = auth.uid();

  update public.workspace_invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;

  select name into v_workspace_name from public.workspaces where id = v_inv.workspace_id;

  insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_inv.workspace_id, auth.uid(), 'invite_accepted', 'workspace_invitations', v_inv.id,
    jsonb_build_object('performed_by', auth.uid(), 'email', v_inv.email,
                        'old_value', v_old_role, 'new_value', v_inv.role, 'timestamp', now()));

  return jsonb_build_object('workspace_name', v_workspace_name, 'role', v_inv.role);
end;
$$;

grant execute on function public.accept_invitation(uuid) to authenticated;

-- ============================================================================
-- update_team_member_role()
-- ============================================================================
create or replace function public.update_team_member_role(p_profile_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_target public.profiles;
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;
  if p_role not in ('admin', 'employee') then raise exception 'invalid_role'; end if;

  select * into v_target from public.profiles where id = p_profile_id;
  if v_target.id is null or v_target.workspace_id <> public.current_workspace_id() then
    raise exception 'not_found';
  end if;

  if v_target.role = 'owner' then
    raise exception 'cannot_modify_owner: use transfer_ownership first';
  end if;
  if v_target.role in ('super_admin', 'support_admin') then
    raise exception 'cannot_modify_admin_role';
  end if;

  update public.profiles set role = p_role where id = p_profile_id;

  insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_target.workspace_id, auth.uid(), 'role_changed', 'profiles', p_profile_id,
    jsonb_build_object('performed_by', auth.uid(), 'old_value', v_target.role, 'new_value', p_role, 'timestamp', now()));
end;
$$;

grant execute on function public.update_team_member_role(uuid, text) to authenticated;

-- ============================================================================
-- set_team_member_status()
-- ============================================================================
create or replace function public.set_team_member_status(p_profile_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_target public.profiles;
  v_action text;
begin
  if not (public.is_owner() or public.is_super_admin()) then raise exception 'forbidden'; end if;
  if p_status not in ('active', 'inactive', 'removed') then raise exception 'invalid_status'; end if;

  select * into v_target from public.profiles where id = p_profile_id;
  if v_target.id is null then raise exception 'not_found'; end if;

  if not public.is_super_admin() and v_target.workspace_id <> public.current_workspace_id() then
    raise exception 'forbidden';
  end if;

  if v_target.id = auth.uid() then raise exception 'cannot_modify_self'; end if;

  if v_target.role = 'owner' then
    raise exception 'cannot_modify_owner: use transfer_ownership first';
  end if;

  if v_target.status = 'removed' then raise exception 'user_already_removed'; end if;

  update public.profiles set status = p_status where id = p_profile_id;

  v_action := case p_status
    when 'removed' then 'user_removed'
    when 'active' then 'user_reactivated'
    else 'user_deactivated'
  end;

  insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_target.workspace_id, auth.uid(), v_action, 'profiles', p_profile_id,
    jsonb_build_object('performed_by', auth.uid(), 'old_value', v_target.status, 'new_value', p_status,
                        'reason', p_reason, 'timestamp', now()));
end;
$$;

grant execute on function public.set_team_member_status(uuid, text, text) to authenticated;

-- ============================================================================
-- transfer_ownership()
-- ============================================================================
create or replace function public.transfer_ownership(p_new_owner_profile_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_target public.profiles;
  v_workspace uuid := public.current_workspace_id();
begin
  if not public.is_owner() then raise exception 'forbidden'; end if;

  select * into v_target from public.profiles where id = p_new_owner_profile_id;
  if v_target.id is null or v_target.workspace_id <> v_workspace then raise exception 'not_found'; end if;
  if v_target.status <> 'active' then raise exception 'target_not_active'; end if;
  if v_target.role not in ('admin', 'employee') then raise exception 'invalid_target_role'; end if;

  update public.profiles set role = 'admin' where id = v_owner_id;
  update public.profiles set role = 'owner' where id = p_new_owner_profile_id;

  insert into public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (v_workspace, v_owner_id, 'owner_transferred', 'profiles', p_new_owner_profile_id,
    jsonb_build_object('performed_by', v_owner_id, 'old_value', v_owner_id::text,
                        'new_value', p_new_owner_profile_id::text, 'timestamp', now()));
end;
$$;

grant execute on function public.transfer_ownership(uuid) to authenticated;

-- ============================================================================
-- log_access_denied()
-- ============================================================================
create or replace function public.log_access_denied(p_route text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_role text;
begin
  select workspace_id, role into v_workspace_id, v_role from public.profiles where id = auth.uid();
  if v_workspace_id is null then return; end if;

  insert into public.audit_log (workspace_id, user_id, action, entity_type, metadata)
  values (v_workspace_id, auth.uid(), 'access_denied', 'route',
    jsonb_build_object('performed_by', auth.uid(), 'route', p_route, 'role', v_role, 'timestamp', now()));
end;
$$;

grant execute on function public.log_access_denied(text) to authenticated;

-- ============================================================================
-- log_auth_event()
-- ============================================================================
create or replace function public.log_auth_event(p_action text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_role text;
  v_action text;
begin
  if p_action not in ('login', 'logout') then raise exception 'invalid_action'; end if;

  select workspace_id, role into v_workspace_id, v_role from public.profiles where id = auth.uid();
  if v_workspace_id is null then return; end if;

  v_action := p_action;
  if p_action = 'login' and v_role = 'super_admin' then
    v_action := 'super_admin_login';
  elsif p_action = 'login' and v_role = 'support_admin' then
    v_action := 'support_admin_login';
  end if;

  insert into public.audit_log (workspace_id, user_id, action, entity_type, metadata)
  values (v_workspace_id, auth.uid(), v_action, 'session',
    jsonb_build_object('performed_by', auth.uid(), 'role', v_role, 'timestamp', now()));
end;
$$;

grant execute on function public.log_auth_event(text) to authenticated;
