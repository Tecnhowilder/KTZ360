-- BRIVIA ENGINE V2 — Catálogo maestro global (motor de reglas configurable)
-- Reemplaza el catálogo por-workspace (service_types/materials/service_materials)
-- por un catálogo GLOBAL (catalog_*) administrable desde Supabase sin redeploy.
-- Cada workspace solo guarda overrides de precio (workspace_price_overrides).

-- ---------------------------------------------------------------------------
-- 0. Quitar el catálogo viejo por-workspace (sembrado por handle_new_user)
-- ---------------------------------------------------------------------------
drop table if exists public.service_materials;
drop table if exists public.service_types;

-- ---------------------------------------------------------------------------
-- 1. Catálogo maestro global (sin workspace_id — solo lectura para authenticated)
-- ---------------------------------------------------------------------------
create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  icon text,
  image_path text,
  supports_quality_tiers boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.catalog_services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.catalog_categories(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  image_path text,
  unit_basis text not null check (unit_basis in ('area','point','length','global')),
  unit_label text not null default 'm²',
  sort_order int not null default 0,
  active boolean not null default true,
  unique (category_id, key)
);
create index idx_catalog_services_category on public.catalog_services(category_id);

create table public.catalog_variants (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.catalog_services(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  unique (service_id, key)
);
create index idx_catalog_variants_service on public.catalog_variants(service_id);

create table public.catalog_questions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.catalog_services(id) on delete cascade,
  variant_id uuid references public.catalog_variants(id) on delete cascade,
  key text not null,
  label text not null,
  help_text text,
  type text not null check (type in ('number','boolean','select','multiselect')),
  unit text,
  default_value jsonb,
  min numeric,
  max numeric,
  visible_if jsonb,
  sort_order int not null default 0,
  required boolean not null default true
);
create index idx_catalog_questions_service on public.catalog_questions(service_id);
create index idx_catalog_questions_variant on public.catalog_questions(variant_id);

create table public.catalog_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.catalog_questions(id) on delete cascade,
  value text not null,
  label text not null,
  sort_order int not null default 0,
  metadata jsonb not null default '{}'::jsonb
);
create index idx_catalog_question_options_question on public.catalog_question_options(question_id);

create table public.catalog_materials (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.catalog_categories(id) on delete set null,
  name text not null,
  unit text not null,
  description text,
  image_path text,
  precio_minimo numeric(12,2) not null default 0,
  precio_sugerido numeric(12,2) not null default 0,
  precio_maximo numeric(12,2) not null default 0,
  packaging_unit text,
  packaging_size numeric(12,4),
  active boolean not null default true
);
create index idx_catalog_materials_category on public.catalog_materials(category_id);

create table public.catalog_material_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.catalog_services(id) on delete cascade,
  variant_id uuid references public.catalog_variants(id) on delete cascade,
  material_id uuid not null references public.catalog_materials(id) on delete cascade,
  quantity_expr jsonb not null,
  waste_pct numeric(5,2) not null default 0,
  condition_expr jsonb,
  round_to_package boolean not null default false,
  label_override text,
  sort_order int not null default 0
);
create index idx_catalog_material_rules_service on public.catalog_material_rules(service_id);
create index idx_catalog_material_rules_variant on public.catalog_material_rules(variant_id);
create index idx_catalog_material_rules_material on public.catalog_material_rules(material_id);

create table public.catalog_labor_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.catalog_services(id) on delete cascade,
  variant_id uuid references public.catalog_variants(id) on delete cascade,
  name text not null,
  unit text not null,
  precio_minimo numeric(12,2) not null default 0,
  precio_sugerido numeric(12,2) not null default 0,
  precio_maximo numeric(12,2) not null default 0,
  quantity_expr jsonb not null default '{"var":"qty"}'::jsonb,
  condition_expr jsonb,
  sort_order int not null default 0
);
create index idx_catalog_labor_rules_service on public.catalog_labor_rules(service_id);
create index idx_catalog_labor_rules_variant on public.catalog_labor_rules(variant_id);

create table public.catalog_equipment_rules (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.catalog_services(id) on delete cascade,
  variant_id uuid references public.catalog_variants(id) on delete cascade,
  name text not null,
  unit text not null,
  precio_minimo numeric(12,2) not null default 0,
  precio_sugerido numeric(12,2) not null default 0,
  precio_maximo numeric(12,2) not null default 0,
  quantity_expr jsonb not null default '{"var":"qty"}'::jsonb,
  condition_expr jsonb,
  sort_order int not null default 0
);
create index idx_catalog_equipment_rules_service on public.catalog_equipment_rules(service_id);
create index idx_catalog_equipment_rules_variant on public.catalog_equipment_rules(variant_id);

-- ---------------------------------------------------------------------------
-- 2. Overrides de precio por workspace
-- ---------------------------------------------------------------------------
create table public.workspace_price_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('material','labor','equipment')),
  entity_id uuid not null,
  custom_price numeric(12,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity_type, entity_id)
);
create trigger trg_workspace_price_overrides_updated_at before update on public.workspace_price_overrides
  for each row execute function public.set_updated_at();
create index idx_workspace_price_overrides_workspace on public.workspace_price_overrides(workspace_id);

-- ---------------------------------------------------------------------------
-- 3. Cambios aditivos a quotes / quote_templates
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column service_lines jsonb not null default '[]'::jsonb,
  add column admin_pct numeric(5,2) not null default 0,
  add column imprevistos_pct numeric(5,2) not null default 0;

alter table public.quote_templates
  add column service_lines jsonb not null default '[]'::jsonb,
  add column admin_pct numeric(5,2) not null default 0,
  add column imprevistos_pct numeric(5,2) not null default 0;

-- ---------------------------------------------------------------------------
-- 4. handle_new_user() — quitar el sembrado del catálogo viejo
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_free_plan_id uuid;
begin
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
