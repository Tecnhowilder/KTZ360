-- ============================================================================
-- 0071 — storage_addons: Paquetes adicionales de almacenamiento Sprint 14
-- ============================================================================
-- Decisiones de arquitectura aprobadas (Sprint 14):
--   - SHELWI es la fuente de verdad. Los addons extienden la cuota en Supabase Storage.
--   - Cancelar addon: NO eliminar archivos, NO perder info, solo bloquear nuevas cargas.
--   - Paquetes: +10 GB ($14.900), +25 GB ($24.900), +50 GB ($35.900) — recurrentes.
--   - FREE y PRO no tienen almacenamiento incluido; los addons solo aplican a PREMIUM.
--   - La cuota total = plan_limits.max_storage_gb + SUM(gb de addons activos).
-- ============================================================================

-- ─── 1. Tabla workspace_storage_addons ────────────────────────────────────────

create table if not exists public.workspace_storage_addons (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  gb              int         not null check (gb in (10, 25, 50)),
  unit_price      numeric(12,2) not null check (unit_price > 0),
  status          text        not null default 'active' check (status in ('active', 'cancelled')),
  activated_at    timestamptz not null default now(),
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.workspace_storage_addons is 'Paquetes adicionales de almacenamiento (+10/+25/+50 GB). Sprint 14.';
comment on column public.workspace_storage_addons.gb is 'GB adicionales contratados (10, 25 o 50).';
comment on column public.workspace_storage_addons.unit_price is 'Precio mensual del paquete en CLP (14900, 24900, 35900).';
comment on column public.workspace_storage_addons.status is 'active = en uso, cancelling = pendiente fin de período, cancelled = terminado.';

create index if not exists idx_storage_addons_workspace
  on public.workspace_storage_addons(workspace_id);

create index if not exists idx_storage_addons_active
  on public.workspace_storage_addons(workspace_id)
  where status = 'active';

-- ─── 2. RLS — workspace_storage_addons ────────────────────────────────────────

alter table public.workspace_storage_addons enable row level security;

create policy "members select storage_addons"
  on public.workspace_storage_addons for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where workspace_id = workspace_storage_addons.workspace_id and id = auth.uid()
    )
  );

create policy "admins insert storage_addons"
  on public.workspace_storage_addons for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where workspace_id = workspace_storage_addons.workspace_id
        and id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

create policy "admins update storage_addons"
  on public.workspace_storage_addons for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where workspace_id = workspace_storage_addons.workspace_id
        and id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- ─── 3. RPC: listar addons de un workspace ────────────────────────────────────

create or replace function public.get_workspace_storage_addons(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles where workspace_id = p_workspace_id and id = v_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'addons', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',           a.id,
          'workspace_id', a.workspace_id,
          'gb',           a.gb,
          'unit_price',   a.unit_price,
          'status',       a.status,
          'activated_at', a.activated_at,
          'cancelled_at', a.cancelled_at,
          'created_at',   a.created_at
        ) order by a.activated_at desc
      ), '[]'::jsonb)
      from public.workspace_storage_addons a
      where a.workspace_id = p_workspace_id
    )
  );
end;
$$;

grant execute on function public.get_workspace_storage_addons(uuid) to authenticated;

-- ─── 4. RPC: activar addon ────────────────────────────────────────────────────

create or replace function public.activate_storage_addon(
  p_workspace_id uuid,
  p_gb           int,
  p_unit_price   numeric(12,2)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_addon_id uuid;
begin
  -- Solo owners/admins
  if not exists (
    select 1 from public.profiles
    where workspace_id = p_workspace_id and id = v_user_id and role in ('owner', 'admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Solo el owner o admin puede activar paquetes');
  end if;

  -- Validar GB permitidos
  if p_gb not in (10, 25, 50) then
    return jsonb_build_object('ok', false, 'error', 'GB no válido. Permitidos: 10, 25, 50');
  end if;

  -- Validar precio
  if p_unit_price <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Precio inválido');
  end if;

  -- Insertar addon
  insert into public.workspace_storage_addons (workspace_id, gb, unit_price, status)
  values (p_workspace_id, p_gb, p_unit_price, 'active')
  returning id into v_addon_id;

  return jsonb_build_object(
    'ok',       true,
    'addon_id', v_addon_id,
    'gb',       p_gb,
    'message',  format('Paquete de +%s GB activado', p_gb)
  );
end;
$$;

grant execute on function public.activate_storage_addon(uuid, int, numeric) to authenticated;

-- ─── 5. RPC: cancelar addon (NO elimina archivos, solo bloquea nuevas cargas) ─

create or replace function public.cancel_storage_addon(p_addon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_workspace_id uuid;
  v_gb           int;
begin
  -- Obtener datos del addon y validar que el usuario es admin del workspace
  select a.workspace_id, a.gb into v_workspace_id, v_gb
  from public.workspace_storage_addons a
  where a.id = p_addon_id and a.status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Addon no encontrado o ya cancelado');
  end if;

  if not exists (
    select 1 from public.profiles
    where workspace_id = v_workspace_id and id = v_user_id and role in ('owner', 'admin')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Solo el owner o admin puede cancelar paquetes');
  end if;

  -- Cancelar addon (NO eliminar archivos)
  update public.workspace_storage_addons
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where id = p_addon_id;

  return jsonb_build_object(
    'ok',      true,
    'message', format('Paquete de +%s GB cancelado. Tus archivos están a salvo.', v_gb)
  );
end;
$$;

grant execute on function public.cancel_storage_addon(uuid) to authenticated;

-- ─── 6. Modificar check_evidence_quota() para incluir addons activos ──────────

create or replace function public.check_evidence_quota(
  p_workspace_id uuid,
  p_additional_bytes bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used_bytes  bigint;
  v_max_bytes   bigint;
  v_plan_code   text;
  v_addon_gb    int;
begin
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  -- Sumar GB de addons activos
  select coalesce(sum(gb), 0)
  into v_addon_gb
  from public.workspace_storage_addons
  where workspace_id = p_workspace_id and status = 'active';

  select
    w.storage_used_bytes,
    (coalesce(pl.max_storage_gb, 0) + v_addon_gb) * 1073741824  -- (plan + addon) GB to bytes
  into v_used_bytes, v_max_bytes
  from public.workspaces w
  join public.plan_limits pl on pl.plan_code = v_plan_code
  where w.id = p_workspace_id;

  -- max_storage_gb = 0 (o null en plan_limits) y sin addons = sin storage
  if v_max_bytes = 0 then
    return jsonb_build_object(
      'allowed', false,
      'error', 'Plan sin almacenamiento incluido',
      'used_bytes', v_used_bytes,
      'max_bytes', 0
    );
  end if;

  return jsonb_build_object(
    'allowed', (v_used_bytes + p_additional_bytes) <= v_max_bytes,
    'used_bytes', v_used_bytes,
    'max_bytes', v_max_bytes,
    'available_bytes', greatest(0, v_max_bytes - v_used_bytes),
    'pct_used', case when v_max_bytes > 0
      then round((v_used_bytes::numeric / v_max_bytes) * 100, 1)
      else 100 end
  );
end;
$$;

grant execute on function public.check_evidence_quota(uuid, bigint) to authenticated;

-- ─── 7. Modificar trg_workspace_storage_alert() para incluir addons activos ───

create or replace function public.trg_workspace_storage_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_bytes  bigint;
  v_pct        numeric;
  v_plan_code  text;
  v_alert_type text;
  v_addon_gb   int;
begin
  v_plan_code := public.get_effective_plan_code(new.id);

  select coalesce(sum(gb), 0)
  into v_addon_gb
  from public.workspace_storage_addons
  where workspace_id = new.id and status = 'active';

  select (coalesce(max_storage_gb, 0) + v_addon_gb) * 1073741824::bigint
  into v_max_bytes
  from public.plan_limits where plan_code = v_plan_code;

  if v_max_bytes = 0 then return new; end if;

  v_pct := round((new.storage_used_bytes::numeric / v_max_bytes) * 100, 1);

  v_alert_type := case
    when v_pct >= 100 then 'storage_100'
    when v_pct >= 90  then 'storage_90'
    when v_pct >= 80  then 'storage_80'
    else null
  end;

  if v_alert_type is null then return new; end if;

  if not exists (
    select 1 from public.notifications
    where workspace_id = new.id
      and type = v_alert_type
      and created_at > now() - interval '12 hours'
  ) then
    insert into public.notifications (workspace_id, user_id, title, message, type)
    select
      new.id, p.id,
      case v_alert_type
        when 'storage_100' then 'Almacenamiento lleno'
        when 'storage_90'  then 'Almacenamiento al 90%'
        when 'storage_80'  then 'Almacenamiento al 80%'
      end,
      round(v_pct, 0)::text || '% del almacenamiento utilizado. ' ||
      case when v_pct >= 100
        then 'No puedes subir más evidencias. Contrata más espacio.'
        else 'Considera liberar espacio o contratar un paquete adicional.'
      end,
      v_alert_type
    from public.profiles p
    where p.workspace_id = new.id
      and p.role in ('owner', 'admin')
      and p.status = 'active';
  end if;

  return new;
end;
$$;

comment on function public.get_workspace_storage_addons is 'Sprint 14: lista paquetes adicionales de almacenamiento del workspace.';
comment on function public.activate_storage_addon        is 'Sprint 14: activa un paquete adicional de almacenamiento (+10/+25/+50 GB).';
comment on function public.cancel_storage_addon          is 'Sprint 14: cancela un paquete adicional sin eliminar archivos.';
