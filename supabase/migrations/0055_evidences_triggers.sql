-- ============================================================================
-- 0055 — evidences_triggers: Triggers + actualización work_logs event_type
-- ============================================================================

-- ─── 1. Ampliar work_logs event_type para incluir evidencias ─────────────────

-- Eliminar constraint existente y recrear con los nuevos tipos
alter table public.work_logs
  drop constraint if exists work_logs_event_type_check;

alter table public.work_logs
  add constraint work_logs_event_type_check check (event_type in (
    -- Sprint 6 (existentes)
    'order_created', 'order_status_changed', 'order_assigned',
    'work_order_created', 'work_order_status_changed', 'work_order_assigned',
    'comment', 'completed',
    -- Sprint 7 (evidencias)
    'evidence_uploaded', 'evidence_deleted'
  ));

-- ─── 2. Trigger: proteger storage_used_bytes de reset accidental ─────────────
-- Si alguien intenta hacer UPDATE de storage_used_bytes a un valor negativo,
-- forzar a 0.

create or replace function public.trg_workspaces_storage_floor()
returns trigger
language plpgsql
as $$
begin
  if new.storage_used_bytes < 0 then
    new.storage_used_bytes := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspaces_storage_floor on public.workspaces;
create trigger trg_workspaces_storage_floor
  before update of storage_used_bytes on public.workspaces
  for each row execute function public.trg_workspaces_storage_floor();

-- ─── 3. Trigger: generar notificación al subir primera evidencia del día ─────

create or replace function public.trg_evidence_notify_on_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_label text;
begin
  -- Construir label del padre
  if new.order_id is not null then
    select 'Pedido ' || order_number into v_entity_label
    from public.orders where id = new.order_id;
  elsif new.work_order_id is not null then
    select 'OT ' || work_order_number into v_entity_label
    from public.work_orders where id = new.work_order_id;
  end if;

  -- Notificar al owner/admin del workspace (max 1 notif por tipo de archivo por hora)
  if not exists (
    select 1 from public.notifications
    where workspace_id = new.workspace_id
      and type = 'evidence_upload'
      and created_at > now() - interval '1 hour'
  ) then
    insert into public.notifications (workspace_id, user_id, title, message, type)
    select
      new.workspace_id,
      p.id,
      'Nueva evidencia subida',
      coalesce(v_entity_label, 'Operación') || ': ' || new.file_name,
      'evidence_upload'
    from public.profiles p
    where p.workspace_id = new.workspace_id
      and p.role in ('owner', 'admin')
      and p.status = 'active'
    limit 3;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_evidence_notify on public.evidence_files;
create trigger trg_evidence_notify
  after insert on public.evidence_files
  for each row execute function public.trg_evidence_notify_on_upload();

-- ─── 4. Trigger: alerta cuando cuota llega al 80% ────────────────────────────

create or replace function public.trg_workspace_storage_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_bytes bigint;
  v_pct       numeric;
  v_plan_code text;
  v_alert_type text;
begin
  v_plan_code := public.get_effective_plan_code(new.id);

  select coalesce(max_storage_gb, 0) * 1073741824::bigint
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

  -- Solo enviar si no se ha enviado en las últimas 12 horas
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
        then 'No puedes subir más evidencias.'
        else 'Considera eliminar archivos antiguos.'
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

drop trigger if exists trg_workspace_storage_alert on public.workspaces;
create trigger trg_workspace_storage_alert
  after update of storage_used_bytes on public.workspaces
  for each row
  when (new.storage_used_bytes <> old.storage_used_bytes)
  execute function public.trg_workspace_storage_alert();

-- ─── 5. Función periódica: recalcular storage_used_bytes (corrección drift) ──
-- Para llamar con pg_cron mensualmente o desde admin panel.

create or replace function public.recalculate_workspace_storage(p_workspace_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  with real_usage as (
    select workspace_id, coalesce(sum(file_size), 0) as total_bytes
    from public.evidence_files
    where deleted_at is null
      and (p_workspace_id is null or workspace_id = p_workspace_id)
    group by workspace_id
  )
  update public.workspaces w
  set storage_used_bytes = coalesce(r.total_bytes, 0),
      updated_at = now()
  from real_usage r
  where w.id = r.workspace_id
    and w.storage_used_bytes <> coalesce(r.total_bytes, 0);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.recalculate_workspace_storage(uuid) to service_role;

comment on function public.recalculate_workspace_storage is 'Recalcula storage_used_bytes desde evidence_files. Llama mensualmente para corregir drift.';

-- ─── 6. Actualizar check_feature_access whitelist con storage_enabled ya presente
-- (ya estaba en 0037, verificamos que la función acepta el flag)
-- No se requiere cambio — storage_enabled ya está en la whitelist de 0037.
