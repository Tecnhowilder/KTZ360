-- ============================================================================
-- 0072 — drive_onedrive_teams_sync: Sincronización Sprint 14
-- ============================================================================
-- Principio arquitectónico: SHELWI ES LA FUENTE DE VERDAD.
-- Drive, OneDrive y Teams son respaldo/colaboración/notificación,
-- NUNCA almacenamiento principal.
--
-- Flujo obligatorio:
--   Usuario → Shelwi → Supabase Storage → storage_used_bytes
--   (solo después): → drive_sync / onedrive_sync / teams_notify
-- ============================================================================

-- ─── 1. Trigger: encolar sync externo cuando se sube evidencia ────────────────
-- Respeta la regla: Shelwi primero, luego sincronización opcional.
-- Solo encola si el workspace tiene la integración activa y auto_sync=true.

create or replace function public.trg_evidence_sync_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  -- Solo al insertar nuevas evidencias (no updates ni soft-delete)
  if tg_op != 'INSERT' then return new; end if;

  v_payload := jsonb_build_object(
    'evidence_id',   new.id,
    'workspace_id',  new.workspace_id,
    'order_id',      new.order_id,
    'work_order_id', new.work_order_id,
    'file_name',     new.file_name,
    'file_type',     new.file_type,
    'storage_path',  new.storage_path,
    'mime_type',     new.mime_type,
    'file_size',     new.file_size,
    'is_signature',  new.is_signature
  );

  -- Google Drive sync
  if exists (
    select 1 from public.integrations
    where workspace_id = new.workspace_id
      and provider = 'drive'
      and status = 'connected'
      and enabled = true
      and (config->>'auto_sync')::boolean = true
  ) then
    perform public.queue_integration_event(new.workspace_id, 'drive', 'drive_sync', v_payload);
  end if;

  -- OneDrive sync
  if exists (
    select 1 from public.integrations
    where workspace_id = new.workspace_id
      and provider = 'onedrive'
      and status = 'connected'
      and enabled = true
      and (config->>'auto_sync')::boolean = true
  ) then
    perform public.queue_integration_event(new.workspace_id, 'onedrive', 'onedrive_sync', v_payload);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_evidence_sync_dispatch on public.evidence_files;
create trigger trg_evidence_sync_dispatch
  after insert on public.evidence_files
  for each row execute function public.trg_evidence_sync_dispatch();

-- ─── 2. Trigger: Teams — OT creada, retrasada, finalizada, incidencia ─────────

create or replace function public.trg_work_orders_teams_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type  text;
  v_title       text;
  v_payload     jsonb;
  v_client_name text;
begin
  -- Solo si Teams está conectado y activo
  if not exists (
    select 1 from public.integrations
    where workspace_id = new.workspace_id
      and provider = 'teams'
      and status = 'connected'
      and enabled = true
  ) then
    return new;
  end if;

  -- Determinar evento
  if tg_op = 'INSERT' then
    v_event_type := 'teams_ot_created';
    v_title      := 'OT creada: ' || new.work_order_number;
  elsif tg_op = 'UPDATE' and old.status != new.status then
    case new.status
      when 'finalizada' then
        v_event_type := 'teams_ot_completed';
        v_title      := 'OT finalizada: ' || new.work_order_number;
      else return new;
    end case;
  else
    return new;
  end if;

  select c.name into v_client_name
  from public.orders o
  left join public.clients c on c.id = o.client_id
  where o.id = new.order_id;

  v_payload := jsonb_build_object(
    'work_order_id',     new.id,
    'work_order_number', new.work_order_number,
    'title',             new.title,
    'order_id',          new.order_id,
    'client_name',       v_client_name,
    'status',            new.status,
    'priority',          new.priority,
    'scheduled_at',      new.scheduled_at,
    'event_title',       v_title
  );

  perform public.queue_integration_event(new.workspace_id, 'teams', v_event_type, v_payload);
  return new;
end;
$$;

drop trigger if exists trg_work_orders_teams on public.work_orders;
create trigger trg_work_orders_teams
  after insert or update of status on public.work_orders
  for each row execute function public.trg_work_orders_teams_dispatch();

-- ─── 3. Trigger: Teams — OT retrasada (desde el scheduler) ───────────────────
-- El automation-scheduler de Sprint 13 llama evaluate_periodic_automations()
-- que detecta work_order_delayed. Adicionalmente se puede notificar a Teams.
-- Esta función se llama desde el worker (no trigger).

create or replace function public.notify_teams_work_order_delayed(
  p_workspace_id   uuid,
  p_work_order_id  uuid,
  p_hours_overdue  numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wo record;
begin
  if not exists (
    select 1 from public.integrations
    where workspace_id = p_workspace_id
      and provider = 'teams'
      and status = 'connected'
      and enabled = true
  ) then
    return;
  end if;

  select wo.work_order_number, wo.title, wo.order_id
  into v_wo
  from public.work_orders wo
  where wo.id = p_work_order_id and wo.workspace_id = p_workspace_id;

  if not found then return; end if;

  perform public.queue_integration_event(
    p_workspace_id, 'teams', 'teams_ot_delayed',
    jsonb_build_object(
      'work_order_id',     p_work_order_id,
      'work_order_number', v_wo.work_order_number,
      'title',             v_wo.title,
      'hours_overdue',     p_hours_overdue,
      'event_title',       '⏰ OT retrasada: ' || v_wo.work_order_number
    )
  );
end;
$$;

grant execute on function public.notify_teams_work_order_delayed(uuid, uuid, numeric) to service_role;

-- ─── 4. RPC: get_sync_status — estado de sincronización por evidencia ─────────

create or replace function public.get_sync_status(
  p_workspace_id uuid,
  p_evidence_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where workspace_id = p_workspace_id and id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'error', 'Sin acceso');
  end if;

  return jsonb_build_object(
    'ok', true,
    'refs', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'provider',     r.provider,
          'external_id',  r.external_id,
          'external_url', r.external_url,
          'synced_at',    r.updated_at
        )
      ), '[]'::jsonb)
      from public.integration_entity_refs r
      where r.workspace_id = p_workspace_id
        and r.entity_type = 'evidence'
        and r.entity_id = p_evidence_id
        and r.provider in ('drive', 'onedrive')
    ),
    'pending_events', (
      select count(*)::int
      from public.integration_events e
      where e.workspace_id = p_workspace_id
        and (e.payload->>'evidence_id') = p_evidence_id::text
        and e.status = 'pending'
        and e.provider in ('drive', 'onedrive')
    )
  );
end;
$$;

grant execute on function public.get_sync_status(uuid, uuid) to authenticated;

comment on function public.trg_evidence_sync_dispatch  is 'Sprint 14: encola drive_sync / onedrive_sync cuando se sube evidencia (si auto_sync=true).';
comment on function public.trg_work_orders_teams_dispatch is 'Sprint 14: notifica Teams al crear/finalizar OT.';
comment on function public.get_sync_status             is 'Sprint 14: estado de sincronización de una evidencia con Drive/OneDrive.';
