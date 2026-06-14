-- Evita registros duplicados en quote_events cuando la misma acción
-- (p. ej. "proposal_sent") se dispara varias veces en poco tiempo
-- (reintentos de UI, múltiples botones de compartir, dobles clics, etc.).
-- Si ya existe un evento del mismo tipo para la misma cotización en los
-- últimos 60 segundos, no se inserta un nuevo registro.

create or replace function public.register_quote_event(p_token uuid, p_event text, p_metadata jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_workspace_id uuid;
begin
  select t.quote_id, t.workspace_id into v_quote_id, v_workspace_id
  from public.quote_access_tokens t
  where t.token = p_token;

  if v_quote_id is null then
    raise exception 'not_found';
  end if;

  if exists (
    select 1 from public.quote_events e
    where e.quote_id = v_quote_id
      and e.event_type = p_event
      and e.created_at > now() - interval '60 seconds'
  ) then
    return;
  end if;

  insert into public.quote_events (workspace_id, quote_id, event_type, metadata)
  values (v_workspace_id, v_quote_id, p_event, p_metadata);
end;
$$;

-- Mismo resguardo para el evento comercial registrado junto al consentimiento
create or replace function public.register_consent_and_event(
  p_token uuid,
  p_status text,
  p_event text,
  p_ip text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_workspace_id uuid;
  v_client_id uuid;
begin
  select t.quote_id, t.workspace_id, q.client_id into v_quote_id, v_workspace_id, v_client_id
  from public.quote_access_tokens t
  join public.quotes q on q.id = t.quote_id
  where t.token = p_token;

  if v_quote_id is null then
    raise exception 'not_found';
  end if;

  if v_client_id is not null then
    insert into public.client_consents (
      workspace_id, client_id, status, accepted_at, rejected_at,
      accepted_via, accepted_quote_id, ip_address, user_agent
    )
    values (
      v_workspace_id, v_client_id, p_status,
      case when p_status = 'accepted' then now() end,
      case when p_status = 'rejected' then now() end,
      'portal_publico', v_quote_id, p_ip, p_user_agent
    );
  end if;

  if not exists (
    select 1 from public.quote_events e
    where e.quote_id = v_quote_id
      and e.event_type = p_event
      and e.created_at > now() - interval '60 seconds'
  ) then
    insert into public.quote_events (workspace_id, quote_id, event_type)
    values (v_workspace_id, v_quote_id, p_event);
  end if;
end;
$$;
