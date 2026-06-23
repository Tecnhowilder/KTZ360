-- ============================================================================
-- 0078 — growth_schema: Sistema de Growth Sprint 17
-- ============================================================================
-- Decisiones aprobadas:
--   - Referidos: usa loyalty_transactions existente para recompensas (sin duplicar)
--   - UTM: tabla utm_events separada (trazabilidad histórica)
--   - Campañas: automation_rules como motor (no se crea motor nuevo)
--   - IA: reutiliza aiCommercial.ts (no se crea nuevo sistema)
--   - Landing pages: DESCOPE Sprint 18
-- ============================================================================

-- ─── 1. referral_programs — programa de referidos por workspace ───────────────
-- Un programa por workspace. Recompensas en puntos de loyalty (Sprint 16).

create table if not exists public.referral_programs (
  id               uuid        primary key default gen_random_uuid(),
  workspace_id     uuid        not null references public.workspaces(id) on delete cascade,
  name             text        not null default 'Programa de Referidos',
  description      text,
  -- Recompensas en puntos (usa loyalty_transactions de Sprint 16)
  referrer_points  int         not null default 200,   -- puntos para quien refiere
  referee_points   int         not null default 100,   -- puntos bonus para quien llega referido
  -- Condición de activación
  min_quote_amount numeric(14,2) not null default 0,   -- monto mínimo de primera cotización
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id)  -- un programa por workspace
);

create trigger trg_referral_programs_updated_at
  before update on public.referral_programs
  for each row execute function public.set_updated_at();

alter table public.referral_programs enable row level security;

create policy "workspace members select referral_programs"
  on public.referral_programs for select
  using (exists (select 1 from public.profiles where workspace_id = referral_programs.workspace_id and id = auth.uid()));

create policy "owner admin manage referral_programs"
  on public.referral_programs for all
  using (exists (
    select 1 from public.profiles where workspace_id = referral_programs.workspace_id
      and id = auth.uid() and role in ('owner','admin','super_admin','support_admin') and status = 'active'
  ));

-- ─── 2. referral_links — links únicos por cliente referidor ──────────────────

create table if not exists public.referral_links (
  id               uuid        primary key default gen_random_uuid(),
  workspace_id     uuid        not null references public.workspaces(id) on delete cascade,
  client_id        uuid        references public.clients(id) on delete set null,
  ref_code         text        not null unique,   -- código corto único: 'abc123'
  visits_count     int         not null default 0,
  conversions_count int        not null default 0,
  active           boolean     not null default true,
  created_at       timestamptz not null default now()
);

create index if not exists idx_referral_links_code
  on public.referral_links(ref_code) where active = true;
create index if not exists idx_referral_links_workspace
  on public.referral_links(workspace_id, client_id);

alter table public.referral_links enable row level security;

create policy "workspace members select referral_links"
  on public.referral_links for select
  using (exists (select 1 from public.profiles where workspace_id = referral_links.workspace_id and id = auth.uid()));

create policy "service inserts referral_links"
  on public.referral_links for insert
  with check (true);  -- validado en RPC

-- ─── 3. referral_conversions — registro de conversiones de referidos ──────────

create table if not exists public.referral_conversions (
  id                   uuid        primary key default gen_random_uuid(),
  workspace_id         uuid        not null references public.workspaces(id) on delete cascade,
  referral_link_id     uuid        not null references public.referral_links(id) on delete cascade,
  referrer_client_id   uuid        references public.clients(id) on delete set null,
  referee_client_id    uuid        references public.clients(id) on delete set null,
  status               text        not null default 'registered' check (status in (
    'registered',    -- se registró en el workspace
    'quote_created', -- creó su primera cotización
    'rewarded'       -- se entregaron los puntos
  )),
  referrer_points_awarded int,
  referee_points_awarded  int,
  created_at           timestamptz not null default now(),
  rewarded_at          timestamptz,
  -- Un cliente solo puede ser referido una vez por workspace
  unique (workspace_id, referee_client_id)
);

create index if not exists idx_referral_conversions_workspace
  on public.referral_conversions(workspace_id, created_at desc);
create index if not exists idx_referral_conversions_link
  on public.referral_conversions(referral_link_id, status);

alter table public.referral_conversions enable row level security;

create policy "workspace members select referral_conversions"
  on public.referral_conversions for select
  using (exists (select 1 from public.profiles where workspace_id = referral_conversions.workspace_id and id = auth.uid()));

create policy "service inserts referral_conversions"
  on public.referral_conversions for insert
  with check (true);

-- ─── 4. utm_events — trazabilidad de fuentes de adquisición ──────────────────
-- Una row por visita/evento de atribución. Histórico completo.

create table if not exists public.utm_events (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  lead_id       uuid        references public.leads(id) on delete set null,
  client_id     uuid        references public.clients(id) on delete set null,
  ref_code      text,       -- si llegó por referido (vincula a referral_links)
  -- UTM params estándar
  utm_source    text,       -- 'facebook', 'google', 'instagram', 'tiktok', 'whatsapp', 'referral', 'direct'
  utm_medium    text,       -- 'cpc', 'organic', 'social', 'email', 'whatsapp'
  utm_campaign  text,       -- nombre de campaña
  utm_content   text,       -- variante
  utm_term      text,       -- keyword
  -- Metadata
  ip            text,
  user_agent    text,
  referrer_url  text,
  landing_url   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_utm_events_workspace
  on public.utm_events(workspace_id, created_at desc);
create index if not exists idx_utm_events_source
  on public.utm_events(workspace_id, utm_source, utm_campaign);
create index if not exists idx_utm_events_client
  on public.utm_events(client_id) where client_id is not null;

alter table public.utm_events enable row level security;

create policy "workspace members select utm_events"
  on public.utm_events for select
  using (exists (select 1 from public.profiles where workspace_id = utm_events.workspace_id and id = auth.uid()));

create policy "service inserts utm_events"
  on public.utm_events for insert
  with check (true);  -- público (tracking sin auth)

-- ─── 5. promotions — cupones y descuentos para clientes ──────────────────────
-- Diferente a founder_promotions (Sprint 9) que es para planes.
-- Esto es para descuentos en cotizaciones comerciales.

create table if not exists public.promotions (
  id                  uuid        primary key default gen_random_uuid(),
  workspace_id        uuid        not null references public.workspaces(id) on delete cascade,
  code                text        not null,   -- 'BIENVENIDO20', 'JULIO2026'
  description         text,
  type                text        not null check (type in (
    'percentage',   -- % del total
    'fixed_amount', -- monto fijo COP
    'free_service'  -- servicio gratuito (solo descriptivo)
  )),
  value               numeric(10,2) not null check (value > 0),  -- % o monto
  min_quote_amount    numeric(14,2) not null default 0,
  max_redemptions     int,  -- null = ilimitado
  current_redemptions int   not null default 0,
  valid_from          timestamptz not null default now(),
  valid_until         timestamptz,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (workspace_id, code)
);

create trigger trg_promotions_updated_at
  before update on public.promotions
  for each row execute function public.set_updated_at();

create index if not exists idx_promotions_workspace
  on public.promotions(workspace_id, active, valid_from, valid_until);

alter table public.promotions enable row level security;

create policy "workspace members select promotions"
  on public.promotions for select
  using (exists (select 1 from public.profiles where workspace_id = promotions.workspace_id and id = auth.uid()));

create policy "owner admin manage promotions"
  on public.promotions for all
  using (exists (
    select 1 from public.profiles where workspace_id = promotions.workspace_id
      and id = auth.uid() and role in ('owner','admin','super_admin','support_admin') and status = 'active'
  ));

-- ─── 6. promotion_redemptions — uso de cupones en cotizaciones ───────────────

create table if not exists public.promotion_redemptions (
  id              uuid        primary key default gen_random_uuid(),
  workspace_id    uuid        not null references public.workspaces(id) on delete cascade,
  promotion_id    uuid        not null references public.promotions(id) on delete cascade,
  client_id       uuid        references public.clients(id) on delete set null,
  quote_id        uuid        references public.quotes(id) on delete set null,
  discount_amount numeric(14,2) not null check (discount_amount >= 0),
  created_at      timestamptz not null default now(),
  unique (promotion_id, quote_id)  -- un cupón por cotización
);

create index if not exists idx_promotion_redemptions_workspace
  on public.promotion_redemptions(workspace_id, created_at desc);

alter table public.promotion_redemptions enable row level security;

create policy "workspace members select promotion_redemptions"
  on public.promotion_redemptions for select
  using (exists (select 1 from public.profiles where workspace_id = promotion_redemptions.workspace_id and id = auth.uid()));

create policy "service inserts promotion_redemptions"
  on public.promotion_redemptions for insert
  with check (true);

-- ─── 7. Agregar categoría 'growth' a automation_templates ────────────────────
-- Permite que el motor de automatizaciones de Sprint 13 maneje campañas de growth.

alter table public.automation_templates
  drop constraint if exists automation_templates_category_check;

alter table public.automation_templates
  add constraint automation_templates_category_check
  check (category in ('crm','operations','retention','billing','growth'));

-- Templates de growth iniciales
insert into public.automation_templates
  (key, name, description, category, trigger_event, trigger_type, delay_hours, conditions, action_type, action_payload, plan_required, sort_order)
values

('referral_welcome',
  'Bienvenida a referido',
  'Cuando un cliente llega por referido, le envía un mensaje de bienvenida por WhatsApp.',
  'growth', 'client_created', 'event', 0,
  '[]'::jsonb,
  'send_whatsapp',
  '{"event_type":"followup","message_override":"¡Bienvenido/a a {{company_name}}! Tu amigo/a te recomienda y ahora eres parte de nuestra comunidad. Pronto recibirás información sobre nuestros servicios."}'::jsonb,
  'pro', 10),

('win_back_60d',
  'Recuperación — 60 días inactivo',
  'Campaña de reactivación para clientes con 60+ días sin actividad.',
  'growth', 'client_inactive', 'periodic', 0,
  '[{"field":"days_inactive","operator":"gte","value":60}]'::jsonb,
  'send_whatsapp',
  '{"event_type":"followup","message_override":"Hola {{client_name}} 👋 ¡Te extrañamos! Han pasado {{days_inactive}} días sin noticias tuyas. ¿Podemos ayudarte con algo nuevo?"}'::jsonb,
  'pro', 11),

('upsell_approved',
  'Upsell post-aprobación',
  'Cuando una cotización es aprobada, sugiere servicios adicionales.',
  'growth', 'quote_approved', 'event', 48,
  '[]'::jsonb,
  'notify_user',
  '{"title":"💡 Oportunidad de upsell","message_template":"{{client_name}} aprobó {{quote_title}}. Momento ideal para ofrecer servicios complementarios."}'::jsonb,
  'pro', 12)

on conflict (key) do update set
  name = excluded.name, description = excluded.description, action_payload = excluded.action_payload;

comment on table public.referral_programs    is 'Sprint 17: programa de referidos. Recompensas via loyalty_transactions (Sprint 16).';
comment on table public.referral_links       is 'Sprint 17: links únicos por cliente referidor con código corto.';
comment on table public.referral_conversions is 'Sprint 17: registro de conversiones de referidos con estado.';
comment on table public.utm_events           is 'Sprint 17: trazabilidad UTM histórica por fuente. Un row por evento.';
comment on table public.promotions           is 'Sprint 17: cupones para descuentos en cotizaciones comerciales.';
comment on table public.promotion_redemptions is 'Sprint 17: uso de cupones en cotizaciones (anti-duplicate por unique).';
