-- ============================================================================
-- 0045 — crm_commercial_status: Estado comercial CRM en cotizaciones
-- ============================================================================
-- Agrega commercial_status (pipeline CRM) separado del status técnico.
-- El status técnico ('Borrador'|'Enviada'|'Aprobada'|'Rechazada'|'Vencida')
-- controla el flujo PDF/facturación.
-- El commercial_status ('borrador'|'enviada'|'vista'|'negociacion'|
-- 'aprobada'|'rechazada'|'vencida') controla el pipeline CRM.
-- ============================================================================

-- 1. Agregar columna commercial_status a quotes
alter table public.quotes
  add column if not exists commercial_status text
    not null default 'borrador'
    check (commercial_status in (
      'borrador', 'enviada', 'vista', 'negociacion',
      'aprobada', 'rechazada', 'vencida'
    ));

-- 2. Sincronizar commercial_status desde status existente (migración retroactiva)
update public.quotes
set commercial_status = lower(status)
where deleted_at is null;

-- 3. Índice para filtros de pipeline
create index if not exists idx_quotes_commercial_status
  on public.quotes(workspace_id, commercial_status)
  where deleted_at is null;

-- ============================================================================
-- Historial de cambios de estado comercial
-- ============================================================================

create table if not exists public.quote_commercial_history (
  id           uuid        primary key default gen_random_uuid(),
  quote_id     uuid        not null references public.quotes(id) on delete cascade,
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  from_status  text,
  to_status    text        not null,
  changed_by   uuid        references auth.users(id),
  observacion  text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_qch_quote_id
  on public.quote_commercial_history(quote_id, created_at desc);
create index if not exists idx_qch_workspace_id
  on public.quote_commercial_history(workspace_id, created_at desc);

-- RLS
alter table public.quote_commercial_history enable row level security;

create policy "workspace members can read quote commercial history"
  on public.quote_commercial_history for select
  using (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = quote_commercial_history.workspace_id
        and p.id = auth.uid()
    )
  );

-- Solo SECURITY DEFINER RPCs pueden insertar (Zero Trust)
create policy "service role can insert quote commercial history"
  on public.quote_commercial_history for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.workspace_id = quote_commercial_history.workspace_id
        and p.id = auth.uid()
    )
  );

-- ============================================================================
-- RPC: update_commercial_status — Zero Trust, feature gated, con historial
-- ============================================================================

create or replace function public.update_commercial_status(
  p_quote_id   uuid,
  p_new_status text,
  p_observacion text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_old_status   text;
  v_user_id      uuid := auth.uid();
  v_allowed_statuses text[] := array[
    'borrador', 'enviada', 'vista', 'negociacion',
    'aprobada', 'rechazada', 'vencida'
  ];
begin
  -- Validar estado permitido
  if not (p_new_status = any(v_allowed_statuses)) then
    return jsonb_build_object('ok', false, 'error', 'Estado comercial inválido');
  end if;

  -- Obtener quote y validar pertenencia al workspace del usuario
  select q.workspace_id, q.commercial_status
  into v_workspace_id, v_old_status
  from public.quotes q
  join public.profiles p on p.workspace_id = q.workspace_id
  where q.id = p_quote_id
    and q.deleted_at is null
    and p.id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Cotización no encontrada o sin acceso');
  end if;

  -- Feature gating: pipeline_enabled requerido (PRO+)
  if not public.check_feature_access(v_workspace_id, 'pipeline_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Pipeline requiere plan PRO o PREMIUM');
  end if;

  -- No hacer nada si el estado es igual
  if v_old_status = p_new_status then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  -- Actualizar commercial_status
  update public.quotes
  set commercial_status = p_new_status,
      updated_at = now()
  where id = p_quote_id;

  -- Registrar en historial
  insert into public.quote_commercial_history
    (quote_id, workspace_id, from_status, to_status, changed_by, observacion)
  values
    (p_quote_id, v_workspace_id, v_old_status, p_new_status, v_user_id, p_observacion);

  -- Si se aprueba/rechaza, sincronizar status técnico
  if p_new_status = 'aprobada' then
    update public.quotes set status = 'Aprobada' where id = p_quote_id;
  elsif p_new_status = 'rechazada' then
    update public.quotes set status = 'Rechazada' where id = p_quote_id;
  end if;

  return jsonb_build_object('ok', true, 'changed', true, 'from', v_old_status, 'to', p_new_status);
end;
$$;

grant execute on function public.update_commercial_status(uuid, text, text) to authenticated;

-- ============================================================================
-- RPC: get_pipeline — cotizaciones agrupadas por commercial_status para PRO+
-- ============================================================================

create or replace function public.get_pipeline(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  -- Validar acceso al workspace
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  -- Feature gating
  if not public.check_feature_access(p_workspace_id, 'pipeline_enabled') then
    return jsonb_build_object('ok', false, 'error', 'Pipeline requiere plan PRO o PREMIUM');
  end if;

  return jsonb_build_object(
    'ok', true,
    'pipeline', (
      select jsonb_object_agg(
        commercial_status,
        jsonb_build_object(
          'count', count,
          'total', total_amount
        )
      )
      from (
        select
          commercial_status,
          count(*)::int as count,
          coalesce(sum((calc_snapshot->>'total')::numeric), 0) as total_amount
        from public.quotes
        where workspace_id = p_workspace_id
          and deleted_at is null
        group by commercial_status
      ) s
    ),
    'quotes', (
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'title', q.title,
          'quote_number', q.quote_number,
          'commercial_status', q.commercial_status,
          'status', q.status,
          'client_id', q.client_id,
          'client_name', c.name,
          'total', coalesce((q.calc_snapshot->>'total')::numeric, 0),
          'sent_at', q.sent_at,
          'updated_at', q.updated_at,
          'created_at', q.created_at,
          'valid_days', q.valid_days
        )
        order by q.updated_at desc
      )
      from public.quotes q
      left join public.clients c on c.id = q.client_id
      where q.workspace_id = p_workspace_id
        and q.deleted_at is null
    )
  );
end;
$$;

grant execute on function public.get_pipeline(uuid) to authenticated;

-- ============================================================================
-- Trigger: sincronizar commercial_status cuando status técnico cambia
-- ============================================================================

create or replace function public.trg_quotes_sync_commercial_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cuando el status técnico se vuelve Aprobada/Rechazada/Vencida,
  -- sincronizar commercial_status (solo si no está ya en ese estado o más avanzado)
  if new.status = 'Aprobada' and new.commercial_status not in ('aprobada') then
    new.commercial_status := 'aprobada';
  elsif new.status = 'Rechazada' and new.commercial_status not in ('rechazada') then
    new.commercial_status := 'rechazada';
  elsif new.status = 'Vencida' and new.commercial_status not in ('vencida','aprobada','rechazada') then
    new.commercial_status := 'vencida';
  elsif new.status = 'Enviada' and new.commercial_status = 'borrador' then
    new.commercial_status := 'enviada';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quotes_sync_commercial_status on public.quotes;
create trigger trg_quotes_sync_commercial_status
  before update of status on public.quotes
  for each row execute function public.trg_quotes_sync_commercial_status();

comment on column public.quotes.commercial_status is 'Estado CRM del pipeline comercial — independiente del status técnico. PRO+';
