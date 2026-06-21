-- ============================================================================
-- 0056 — roles_expansion: Nuevos roles operativos + migración employee→operario
-- ============================================================================
-- Decisión aprobada:
--   Roles finales: owner | admin | supervisor | comercial | operario | super_admin | support_admin
--   Migrar: employee → operario (obsoleto)
--
-- ORDEN CRÍTICO: migrar datos ANTES de agregar el constraint nuevo.
-- PostgreSQL valida el constraint inmediatamente al crearlo — si hay filas
-- con 'employee' al momento de ADD CONSTRAINT, el check falla con error 23514.
-- ============================================================================

-- ─── 1. PRIMERO: eliminar constraint viejo ────────────────────────────────────

alter table public.profiles
  drop constraint if exists profiles_role_check;

-- ─── 2. SEGUNDO: migrar datos employee → operario ANTES de agregar constraint ─

update public.profiles
set role = 'operario', updated_at = now()
where role = 'employee';

-- ─── 3. TERCERO: agregar el nuevo constraint (ya sin filas 'employee') ─────────

alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'owner', 'admin', 'supervisor', 'comercial', 'operario',
    'super_admin', 'support_admin'
  ));

-- ─── 4. workspace_invitations: mismo patrón (drop → migrar → add) ────────────

alter table public.workspace_invitations
  drop constraint if exists workspace_invitations_role_check;

update public.workspace_invitations
set role = 'operario'
where role = 'employee';

alter table public.workspace_invitations
  add constraint workspace_invitations_role_check
  check (role in ('admin', 'supervisor', 'comercial', 'operario'));

-- ─── 5. RPC actualizada: invite_team_member (acepta nuevos roles) ─────────────

create or replace function public.invite_team_member(
  p_workspace_id uuid,
  p_email        text,
  p_role         text,
  p_full_name    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id     uuid := auth.uid();
  v_caller_role   text;
  v_seats         jsonb;
  v_invitation_id uuid;
  v_allowed_roles text[] := array['admin','supervisor','comercial','operario'];
begin
  -- Validar rol permitido
  if not (p_role = any(v_allowed_roles)) then
    return jsonb_build_object('ok', false, 'error',
      'Rol inválido. Permitidos: admin, supervisor, comercial, operario');
  end if;

  -- Solo owner/admin pueden invitar
  select role into v_caller_role
  from public.profiles
  where id = v_caller_id and workspace_id = p_workspace_id and status = 'active';

  if v_caller_role not in ('owner','admin','super_admin','support_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Feature gating: multiuser_enabled (PREMIUM)
  if not public.check_feature_access(p_workspace_id, 'multiuser_enabled') then
    return jsonb_build_object('ok', false, 'error', 'feature_not_available');
  end if;

  -- Verificar cuota de asientos
  v_seats := public.get_team_seats(p_workspace_id);
  if (v_seats->>'seats_used')::int >= (v_seats->>'seats_limit')::int then
    return jsonb_build_object('ok', false, 'error', 'seat_limit_exceeded',
      'seats_used', v_seats->'seats_used', 'seats_limit', v_seats->'seats_limit');
  end if;

  -- Validar email
  if p_email is null or length(trim(p_email)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  -- Crear invitación (invalida duplicados pendientes del mismo email)
  update public.workspace_invitations
  set status = 'revoked'
  where workspace_id = p_workspace_id
    and lower(email) = lower(trim(p_email))
    and status = 'pending';

  insert into public.workspace_invitations
    (workspace_id, email, full_name, role, invited_by)
  values
    (p_workspace_id, lower(trim(p_email)), p_full_name, p_role, v_caller_id)
  returning id into v_invitation_id;

  -- Log de auditoría
  insert into public.audit_log
    (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (
    p_workspace_id, v_caller_id,
    'invited', 'workspace_invitations', v_invitation_id,
    jsonb_build_object('email', p_email, 'role', p_role, 'performed_by', v_caller_id)
  );

  return jsonb_build_object(
    'ok', true,
    'invitation_id', v_invitation_id,
    'email',  p_email,
    'role',   p_role
  );
end;
$$;

grant execute on function public.invite_team_member(uuid, text, text, text) to authenticated;

-- ─── 6. RPC actualizada: update_team_member_role ─────────────────────────────

create or replace function public.update_team_member_role(
  p_profile_id uuid,
  p_role       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
  v_target_ws   uuid;
  v_allowed     text[] := array['admin','supervisor','comercial','operario'];
begin
  if not (p_role = any(v_allowed)) then
    raise exception 'invalid_role: Permitidos: admin, supervisor, comercial, operario'
      using errcode = 'P0001';
  end if;

  select workspace_id into v_target_ws
  from public.profiles where id = p_profile_id;

  select role into v_caller_role
  from public.profiles
  where id = v_caller_id and workspace_id = v_target_ws and status = 'active';

  if v_caller_role not in ('owner','super_admin','support_admin') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles where id = p_profile_id and role = 'owner'
  ) then
    raise exception 'cannot_modify_owner: use transfer_ownership first'
      using errcode = 'P0001';
  end if;

  update public.profiles
  set role = p_role, updated_at = now()
  where id = p_profile_id;

  insert into public.audit_log
    (workspace_id, user_id, action, entity_type, entity_id, metadata)
  values (
    v_target_ws, v_caller_id,
    'role_changed', 'profiles', p_profile_id,
    jsonb_build_object('new_role', p_role, 'performed_by', v_caller_id)
  );
end;
$$;

grant execute on function public.update_team_member_role(uuid, text) to authenticated;

-- ─── 7. Helpers GPS (usados por migraciones 0057/0058) ───────────────────────

create or replace function public.current_user_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and status = 'active'
  limit 1;
$$;

grant execute on function public.current_user_role() to authenticated;

create or replace function public.can_view_full_team(p_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('owner','admin','supervisor','super_admin','support_admin')
     from public.profiles
     where id = auth.uid() and workspace_id = p_workspace_id and status = 'active'),
    false
  );
$$;

grant execute on function public.can_view_full_team(uuid) to authenticated;

comment on function public.invite_team_member   is 'Sprint 8: acepta roles admin/supervisor/comercial/operario';
comment on function public.update_team_member_role is 'Sprint 8: acepta roles admin/supervisor/comercial/operario';
