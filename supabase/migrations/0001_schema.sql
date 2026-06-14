-- BRIVIA — Esquema base (Fase 1)
-- Modelo: Workspace (independiente | empresa) como entidad raíz multi-tenant.
-- Todas las tablas de negocio cuelgan de workspace_id.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Planes y suscripciones (preparado para Stripe / Wompi / Mercado Pago)
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- 'free' | 'pro' | 'premium'
  name text not null,
  description text,
  price numeric(12,2) not null default 0,
  currency_code text not null default 'COP',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.plans (code, name, description, price, currency_code) values
  ('free', 'Gratis', '5 cotizaciones al mes, hasta 20 clientes, PDF básico', 0, 'COP'),
  ('pro', 'Pro', 'Cotizaciones y clientes ilimitados, plantillas, branding, PDF profesional', 29900, 'COP'),
  ('premium', 'Premium', 'Todo Pro + Brivia IA, cotización desde foto, reportes avanzados, multiusuario', 59900, 'COP');

-- ---------------------------------------------------------------------------
-- Workspaces (= "empresa" en sentido amplio: independiente o empresa formal)
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'independiente' check (type in ('independiente', 'empresa')),
  logo_path text,
  currency_code text not null default 'COP',
  current_plan_id uuid references public.plans(id),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'active'
);
create trigger trg_workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Suscripciones por workspace
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled')),
  provider text not null default 'manual' check (provider in ('manual','stripe','wompi','mercadopago')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create index idx_subscriptions_workspace on public.subscriptions(workspace_id);

-- ---------------------------------------------------------------------------
-- Feature flags por workspace (controlados por plan)
-- ---------------------------------------------------------------------------
create table public.workspace_features (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  ai_enabled boolean not null default false,
  photo_quote_enabled boolean not null default false,
  multiuser_enabled boolean not null default false,
  advanced_reports_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger trg_workspace_features_updated_at before update on public.workspace_features
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','employee')),
  full_name text,
  email text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create index idx_profiles_workspace on public.profiles(workspace_id);

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  name text not null,
  meta text,               -- ej. "Bogotá · Constructora"
  initial text,            -- iniciales para avatar (se calcula si no se provee)
  phone text,
  email text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create index idx_clients_workspace on public.clients(workspace_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Proyectos (agrupan cotizaciones de una obra)
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  location text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
create index idx_projects_workspace on public.projects(workspace_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Catálogo de servicios por workspace (editable; seedeado al crear workspace)
-- ---------------------------------------------------------------------------
create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,             -- ej. 'pintura', 'drywall'
  name text not null,
  description text,
  labor_per_m2 numeric(12,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);
create trigger trg_service_types_updated_at before update on public.service_types
  for each row execute function public.set_updated_at();
create index idx_service_types_workspace on public.service_types(workspace_id);

-- ---------------------------------------------------------------------------
-- Materiales (catálogo de precios por workspace)
-- ---------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  name text not null,
  unit text not null,            -- 'Galón', 'm²', 'Saco', etc.
  category text,                 -- nombre del servicio asociado, informativo
  price numeric(12,2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_materials_updated_at before update on public.materials
  for each row execute function public.set_updated_at();
create index idx_materials_workspace on public.materials(workspace_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Rendimiento de materiales por servicio (m² -> cantidad de material)
-- ---------------------------------------------------------------------------
create table public.service_materials (
  id uuid primary key default gen_random_uuid(),
  service_type_id uuid not null references public.service_types(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  yield_per_m2 numeric(12,4) not null default 0,
  sort_order int not null default 0
);
create index idx_service_materials_service on public.service_materials(service_type_id);
create index idx_service_materials_material on public.service_materials(material_id);

-- ---------------------------------------------------------------------------
-- Plantillas operativas (reutilizar configuración de cotización)
-- ---------------------------------------------------------------------------
create table public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  name text not null,
  services jsonb not null default '[]'::jsonb,  -- array de service_type ids
  area numeric(12,2) not null default 0,
  util numeric(5,2) not null default 25,
  iva boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_quote_templates_updated_at before update on public.quote_templates
  for each row execute function public.set_updated_at();
create index idx_quote_templates_workspace on public.quote_templates(workspace_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Plantillas visuales de PDF (estilos de propuesta)
-- ---------------------------------------------------------------------------
create table public.pdf_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  name text not null default 'Predeterminada',
  is_default boolean not null default true,
  config jsonb not null default '{}'::jsonb,  -- colores, layout, términos y condiciones
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_pdf_templates_updated_at before update on public.pdf_templates
  for each row execute function public.set_updated_at();
create index idx_pdf_templates_workspace on public.pdf_templates(workspace_id);

-- ---------------------------------------------------------------------------
-- Contador de numeración de cotizaciones por workspace y año
-- ---------------------------------------------------------------------------
create table public.workspace_quote_counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  year int not null,
  last_number int not null default 0,
  primary key (workspace_id, year)
);

create or replace function public.next_quote_number(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_number int;
begin
  insert into public.workspace_quote_counters (workspace_id, year, last_number)
  values (p_workspace_id, v_year, 1)
  on conflict (workspace_id, year)
  do update set last_number = public.workspace_quote_counters.last_number + 1
  returning last_number into v_number;

  return 'BRI-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Cotizaciones
-- ---------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  quote_number text not null,
  title text not null,
  location text,
  services jsonb not null default '[]'::jsonb,   -- array de service_type ids
  area numeric(12,2) not null default 0,
  height numeric(6,2) not null default 2.5,
  util numeric(5,2) not null default 25,
  iva boolean not null default true,
  discount numeric(5,2) not null default 0,
  discount_on boolean not null default false,
  valid_days int not null default 15,
  currency_code text not null default 'COP',
  status text not null default 'Borrador'
    check (status in ('Borrador','Enviada','Aprobada','Rechazada','Vencida')),
  calc_snapshot jsonb not null default '{}'::jsonb,  -- desglose calculado (materials, labor, totals...)
  doc_items jsonb not null default '[]'::jsonb,      -- renglones del documento/PDF
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, quote_number)
);
create trigger trg_quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();
create index idx_quotes_workspace on public.quotes(workspace_id) where deleted_at is null;
create index idx_quotes_client on public.quotes(client_id);

create or replace function public.quotes_set_number()
returns trigger
language plpgsql
as $$
begin
  if new.quote_number is null or new.quote_number = '' then
    new.quote_number := public.next_quote_number(new.workspace_id);
  end if;
  return new;
end;
$$;
create trigger trg_quotes_set_number before insert on public.quotes
  for each row execute function public.quotes_set_number();

-- ---------------------------------------------------------------------------
-- Datos de empresa (encabezado de PDF)
-- ---------------------------------------------------------------------------
create table public.company_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  name text not null default '',
  nit text,
  phone text,
  city text,
  email text,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_company_settings_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leads (pipeline comercial: lead -> cliente -> cotización -> proyecto)
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id),
  name text not null,
  phone text,
  email text,
  source text,
  status text not null default 'nuevo',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create index idx_leads_workspace on public.leads(workspace_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  message text,
  type text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on public.notifications(user_id, is_read);

-- ---------------------------------------------------------------------------
-- Adjuntos (fotos de proyecto, evidencias, planos, documentos)
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,   -- 'quote' | 'project' | 'client' | ...
  entity_id uuid not null,
  file_name text not null,
  file_path text not null,
  file_size bigint,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_attachments_entity on public.attachments(entity_type, entity_id);
create index idx_attachments_workspace on public.attachments(workspace_id);

-- ---------------------------------------------------------------------------
-- Uso de IA (control de costos)
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id),
  feature text not null,        -- 'describe' | 'photo' | 'message' | ...
  provider text not null default 'internal',
  tokens_used int not null default 0,
  estimated_cost numeric(12,4) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_ai_usage_workspace on public.ai_usage(workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Auditoría / actividad reciente
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,          -- 'created' | 'updated' | 'status_changed' | 'deleted' | ...
  entity_type text not null,     -- 'quote' | 'client' | 'template' | ...
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_log_workspace on public.audit_log(workspace_id, created_at desc);
