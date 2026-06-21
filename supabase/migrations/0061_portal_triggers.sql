-- ============================================================================
-- 0061 — portal_triggers: Trigger en quote_events para actualizar estado
-- ============================================================================
-- Zero Trust: cuando el cliente acepta/rechaza desde el portal,
-- el frontend llama register_consent_and_event() (RPC existente).
-- Este trigger actualiza quote.status y commercial_status, y genera notificación.
-- El frontend NO hace ninguna actualización directa de estado.
-- ============================================================================

create or replace function public.trg_quote_events_on_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_status text;
  v_cs         text;
  v_client_name text;
  v_quote_number text;
  v_title        text;
  v_workspace_id uuid;
begin
  -- Solo actuar en aceptación y rechazo del cliente
  if new.event_type not in ('proposal_accepted', 'proposal_rejected') then
    return new;
  end if;

  v_new_status := case new.event_type
    when 'proposal_accepted' then 'Aprobada'
    when 'proposal_rejected' then 'Rechazada'
  end;

  v_cs := case new.event_type
    when 'proposal_accepted' then 'aprobada'
    when 'proposal_rejected' then 'rechazada'
  end;

  -- Obtener datos de la cotización
  select q.workspace_id, c.name, q.quote_number, q.title
  into v_workspace_id, v_client_name, v_quote_number, v_title
  from public.quotes q
  left join public.clients c on c.id = q.client_id
  where q.id = new.quote_id;

  -- Actualizar status técnico + commercial_status
  update public.quotes
  set status            = v_new_status,
      commercial_status = v_cs,
      updated_at        = now()
  where id = new.quote_id;

  -- Historial comercial
  insert into public.quote_commercial_history
    (quote_id, workspace_id, to_status, observacion)
  values (
    new.quote_id, v_workspace_id, v_cs,
    'Cliente ' || case v_cs when 'aprobada' then 'aprobó' else 'rechazó' end || ' desde el portal'
  );

  -- Notificación al workspace (owner/admin)
  insert into public.notifications (workspace_id, user_id, title, message, type)
  select
    v_workspace_id,
    p.id,
    case v_cs
      when 'aprobada' then '✅ Cotización aprobada'
      else '❌ Cotización rechazada'
    end,
    coalesce(v_client_name, 'El cliente') || ' · ' || coalesce(v_quote_number, v_title),
    case v_cs when 'aprobada' then 'success' else 'warning' end
  from public.profiles p
  where p.workspace_id = v_workspace_id
    and p.role in ('owner', 'admin')
    and p.status = 'active';

  return new;
end;
$$;

drop trigger if exists trg_quote_events_decision on public.quote_events;
create trigger trg_quote_events_decision
  after insert on public.quote_events
  for each row execute function public.trg_quote_events_on_decision();

comment on function public.trg_quote_events_on_decision is
  'Sprint 10: cuando el cliente acepta/rechaza, actualiza status técnico + commercial + notifica. Eliminando Zero Trust violation del frontend.';
