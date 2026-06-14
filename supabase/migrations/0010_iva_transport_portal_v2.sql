-- ---------------------------------------------------------------------------
-- 0010: corrección de IVA en materiales, transporte de materiales,
-- branding white-label, y portal público de cotizaciones (consentimiento +
-- eventos comerciales).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Fase 1 — IVA en catálogo y transporte en cotizaciones/plantillas
-- ---------------------------------------------------------------------------
alter table public.catalog_materials
  add column incluye_iva boolean not null default true;

alter table public.quotes
  add column transport_cost numeric not null default 0,
  add column transport_enabled boolean not null default false;

alter table public.quote_templates
  add column transport_cost numeric not null default 0,
  add column transport_enabled boolean not null default false;

alter table public.company_settings
  add column white_label_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Fase 2 — portal público: tokens de acceso, consentimientos, eventos
-- ---------------------------------------------------------------------------

-- Token de acceso público por cotización (uno por cotización)
create table public.quote_access_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (quote_id)
);

-- Consentimiento de tratamiento de datos por cliente
create table public.client_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'rejected')),
  accepted_at timestamptz,
  rejected_at timestamptz,
  accepted_via text,
  accepted_quote_id uuid references public.quotes(id),
  consent_version text not null default 'v1',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index client_consents_client_status_idx on public.client_consents (client_id, status);

-- Eventos comerciales de la propuesta
create table public.quote_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  event_type text not null check (event_type in (
    'proposal_sent', 'proposal_opened', 'proposal_downloaded',
    'proposal_accepted', 'proposal_rejected', 'proposal_changes_requested'
  )),
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index quote_events_quote_type_idx on public.quote_events (quote_id, event_type);

-- ---------------------------------------------------------------------------
-- 3. RLS — acceso normal por workspace (panel interno)
-- ---------------------------------------------------------------------------
alter table public.quote_access_tokens enable row level security;
alter table public.client_consents enable row level security;
alter table public.quote_events enable row level security;

do $$
declare
  t text;
  tables text[] := array['quote_access_tokens', 'client_consents', 'quote_events'];
begin
  foreach t in array tables loop
    execute format($f$
      create policy "%I_select_workspace" on public.%I for select
        to authenticated
        using (workspace_id = public.current_workspace_id())
    $f$, t, t);

    execute format($f$
      create policy "%I_insert_workspace" on public.%I for insert
        to authenticated
        with check (workspace_id = public.current_workspace_id())
    $f$, t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Funciones RPC `security definer` para el portal público (sin sesión)
-- ---------------------------------------------------------------------------

-- Devuelve cotización + cliente + empresa + estado de consentimiento, dado un token válido
create or replace function public.get_public_quote(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'quote', to_jsonb(q) - 'workspace_id' - 'created_by',
    'client', to_jsonb(c) - 'workspace_id' - 'created_by',
    'company', to_jsonb(cs) - 'workspace_id',
    'consent_status', (
      select status from public.client_consents
      where client_id = q.client_id
      order by created_at desc
      limit 1
    ),
    'consent_accepted_at', (
      select accepted_at from public.client_consents
      where client_id = q.client_id and status = 'accepted'
      order by created_at desc
      limit 1
    )
  ) into result
  from public.quote_access_tokens t
  join public.quotes q on q.id = t.quote_id and q.deleted_at is null
  left join public.clients c on c.id = q.client_id
  left join public.company_settings cs on cs.workspace_id = q.workspace_id
  where t.token = p_token;

  if result is null then
    raise exception 'not_found';
  end if;

  return result;
end;
$$;

-- Registra un evento de la propuesta (no requiere consentimiento)
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

  insert into public.quote_events (workspace_id, quote_id, event_type, metadata)
  values (v_workspace_id, v_quote_id, p_event, p_metadata);
end;
$$;

-- Registra aceptación/rechazo de consentimiento + evento comercial relacionado
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

  insert into public.quote_events (workspace_id, quote_id, event_type)
  values (v_workspace_id, v_quote_id, p_event);
end;
$$;

grant execute on function public.get_public_quote(uuid) to anon, authenticated;
grant execute on function public.register_quote_event(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.register_consent_and_event(uuid, text, text, text, text) to anon, authenticated;
