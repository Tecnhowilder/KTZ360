-- ============================================================================
-- 0074 — loyalty_reviews_surveys_schema: Sprint 16
-- ============================================================================
-- BASADO EN AUDITORÍA: no se duplican funcionalidades existentes.
-- No se toca: customer_health_scores, portal existente, CustomerSuccessPage.
--
-- Lo nuevo:
--   loyalty_programs, loyalty_transactions, loyalty_rewards
--   reviews, review_responses
--   surveys, survey_responses
--   + nuevos campos portal en company_settings
-- ============================================================================

-- ─── 1. Nuevos campos en company_settings ────────────────────────────────────

alter table public.company_settings
  add column if not exists portal_show_reviews  boolean not null default false,
  add column if not exists portal_show_loyalty  boolean not null default false,
  add column if not exists loyalty_enabled      boolean not null default false;

comment on column public.company_settings.portal_show_reviews is 'Sprint 16: mostrar tab Reseñas en portal del cliente';
comment on column public.company_settings.portal_show_loyalty is 'Sprint 16: mostrar tab Mis Puntos en portal del cliente';
comment on column public.company_settings.loyalty_enabled     is 'Sprint 16: habilitar programa de fidelización';

-- ─── 2. loyalty_programs — programa de puntos por workspace ──────────────────
-- Un workspace puede tener un solo programa activo.
-- Las reglas son configurables (no hardcodeadas).

create table if not exists public.loyalty_programs (
  id                   uuid        primary key default gen_random_uuid(),
  workspace_id         uuid        not null references public.workspaces(id) on delete cascade,
  name                 text        not null default 'Programa de Fidelización',
  description          text,
  -- Reglas de ganancia de puntos (configurables)
  points_per_currency  numeric(8,4) not null default 1.0,   -- puntos por COP de pedido aprobado
  points_on_ot_complete int         not null default 50,     -- puntos por OT finalizada
  points_on_review      int         not null default 100,    -- puntos bonus por dejar reseña
  -- Niveles: [{name:'Bronce',min:0,max:499,color:'#CD7F32'}, ...]
  levels               jsonb        not null default '[
    {"name":"Bronce","min":0,"max":499,"color":"#CD7F32","icon":"🥉"},
    {"name":"Plata","min":500,"max":1499,"color":"#94A3B8","icon":"🥈"},
    {"name":"Oro","min":1500,"max":2999,"color":"#D97706","icon":"🥇"},
    {"name":"Diamante","min":3000,"max":null,"color":"#7C3AED","icon":"💎"}
  ]'::jsonb,
  active               boolean     not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id)  -- un solo programa por workspace
);

create trigger trg_loyalty_programs_updated_at
  before update on public.loyalty_programs
  for each row execute function public.set_updated_at();

alter table public.loyalty_programs enable row level security;

create policy "workspace members select loyalty_programs"
  on public.loyalty_programs for select
  using (exists (select 1 from public.profiles where workspace_id = loyalty_programs.workspace_id and id = auth.uid()));

create policy "owner admin manage loyalty_programs"
  on public.loyalty_programs for all
  using (exists (
    select 1 from public.profiles where workspace_id = loyalty_programs.workspace_id
      and id = auth.uid() and role in ('owner','admin','super_admin','support_admin') and status = 'active'
  ));

-- ─── 3. loyalty_transactions — historial de puntos por cliente ────────────────

create table if not exists public.loyalty_transactions (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  client_id     uuid        not null references public.clients(id) on delete cascade,
  order_id      uuid        references public.orders(id) on delete set null,
  work_order_id uuid        references public.work_orders(id) on delete set null,
  points        int         not null,  -- positivo = ganados, negativo = canjeados
  type          text        not null check (type in (
    'earned_order', 'earned_ot', 'earned_review', 'redeemed', 'adjustment', 'bonus', 'expiration'
  )),
  description   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_loyalty_transactions_client
  on public.loyalty_transactions(workspace_id, client_id, created_at desc);
create index if not exists idx_loyalty_transactions_workspace
  on public.loyalty_transactions(workspace_id, created_at desc);

alter table public.loyalty_transactions enable row level security;

create policy "workspace members select loyalty_transactions"
  on public.loyalty_transactions for select
  using (exists (select 1 from public.profiles where workspace_id = loyalty_transactions.workspace_id and id = auth.uid()));

create policy "service inserts loyalty_transactions"
  on public.loyalty_transactions for insert
  with check (true);  -- validado por RPCs security definer

-- ─── 4. loyalty_rewards — catálogo de recompensas canjeables ─────────────────

create table if not exists public.loyalty_rewards (
  id                 uuid        primary key default gen_random_uuid(),
  workspace_id       uuid        not null references public.workspaces(id) on delete cascade,
  name               text        not null,
  description        text,
  points_required    int         not null check (points_required > 0),
  quantity_available int,  -- null = ilimitado
  quantity_redeemed  int         not null default 0,
  active             boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger trg_loyalty_rewards_updated_at
  before update on public.loyalty_rewards
  for each row execute function public.set_updated_at();

create index if not exists idx_loyalty_rewards_workspace
  on public.loyalty_rewards(workspace_id, active);

alter table public.loyalty_rewards enable row level security;

create policy "workspace members select loyalty_rewards"
  on public.loyalty_rewards for select
  using (exists (select 1 from public.profiles where workspace_id = loyalty_rewards.workspace_id and id = auth.uid()));

create policy "owner admin manage loyalty_rewards"
  on public.loyalty_rewards for all
  using (exists (
    select 1 from public.profiles where workspace_id = loyalty_rewards.workspace_id
      and id = auth.uid() and role in ('owner','admin','super_admin','support_admin') and status = 'active'
  ));

-- ─── 5. reviews — calificaciones de clientes ─────────────────────────────────

create table if not exists public.reviews (
  id                uuid        primary key default gen_random_uuid(),
  workspace_id      uuid        not null references public.workspaces(id) on delete cascade,
  client_id         uuid        not null references public.clients(id) on delete cascade,
  order_id          uuid        references public.orders(id) on delete set null,
  work_order_id     uuid        references public.work_orders(id) on delete set null,
  rating            int         not null check (rating between 1 and 5),
  comment           text,
  created_via_token uuid        references public.client_portal_tokens(id) on delete set null,
  visible           boolean     not null default true,
  created_at        timestamptz not null default now(),
  -- Anti-duplicate: un cliente califica una sola vez por pedido
  unique (workspace_id, client_id, order_id)
);

create index if not exists idx_reviews_workspace
  on public.reviews(workspace_id, created_at desc);
create index if not exists idx_reviews_rating
  on public.reviews(workspace_id, rating);

alter table public.reviews enable row level security;

-- Empresa ve sus reseñas
create policy "workspace members select reviews"
  on public.reviews for select
  using (exists (select 1 from public.profiles where workspace_id = reviews.workspace_id and id = auth.uid()));

-- INSERT solo vía RPC security definer (token validado)
create policy "service inserts reviews"
  on public.reviews for insert
  with check (true);

-- ─── 6. review_responses — respuesta de la empresa a reseñas ─────────────────

create table if not exists public.review_responses (
  id            uuid        primary key default gen_random_uuid(),
  review_id     uuid        not null references public.reviews(id) on delete cascade,
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  responded_by  uuid        not null references auth.users(id),
  response      text        not null,
  created_at    timestamptz not null default now(),
  unique (review_id)  -- una sola respuesta por reseña
);

alter table public.review_responses enable row level security;

create policy "workspace members select review_responses"
  on public.review_responses for select
  using (exists (select 1 from public.profiles where workspace_id = review_responses.workspace_id and id = auth.uid()));

create policy "owner admin insert review_responses"
  on public.review_responses for insert
  with check (exists (
    select 1 from public.profiles where workspace_id = review_responses.workspace_id
      and id = auth.uid() and role in ('owner','admin','super_admin','support_admin') and status = 'active'
  ));

-- ─── 7. surveys — encuestas de satisfacción ──────────────────────────────────

create table if not exists public.surveys (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  title         text        not null default 'Encuesta de Satisfacción',
  description   text,
  -- questions JSONB: [{id:'q1', type:'rating'|'text'|'nps', label:'¿Cómo calificarías?', required:true}]
  questions     jsonb       not null default '[]'::jsonb,
  include_nps   boolean     not null default true,
  trigger_event text        not null default 'order_completed' check (trigger_event in (
    'order_completed', 'work_order_completed', 'manual'
  )),
  delay_hours   int         not null default 24,  -- horas después del evento
  active        boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_surveys_updated_at
  before update on public.surveys
  for each row execute function public.set_updated_at();

alter table public.surveys enable row level security;

create policy "workspace members select surveys"
  on public.surveys for select
  using (exists (select 1 from public.profiles where workspace_id = surveys.workspace_id and id = auth.uid()));

create policy "owner admin manage surveys"
  on public.surveys for all
  using (exists (
    select 1 from public.profiles where workspace_id = surveys.workspace_id
      and id = auth.uid() and role in ('owner','admin','super_admin','support_admin') and status = 'active'
  ));

-- ─── 8. survey_responses — respuestas de clientes ────────────────────────────

create table if not exists public.survey_responses (
  id                uuid        primary key default gen_random_uuid(),
  survey_id         uuid        not null references public.surveys(id) on delete cascade,
  workspace_id      uuid        not null references public.workspaces(id) on delete cascade,
  client_id         uuid        references public.clients(id) on delete set null,
  order_id          uuid        references public.orders(id) on delete set null,
  work_order_id     uuid        references public.work_orders(id) on delete set null,
  -- answers: {q1: 'respuesta', q2: 4, ...}
  answers           jsonb       not null default '{}'::jsonb,
  nps_score         int         check (nps_score between 0 and 10),  -- null si no incluye NPS
  created_via_token uuid        references public.client_portal_tokens(id) on delete set null,
  created_at        timestamptz not null default now(),
  -- Anti-duplicate: un cliente responde una sola vez por entidad
  unique (survey_id, client_id, order_id)
);

create index if not exists idx_survey_responses_workspace
  on public.survey_responses(workspace_id, created_at desc);
create index if not exists idx_survey_responses_nps
  on public.survey_responses(workspace_id, nps_score)
  where nps_score is not null;

alter table public.survey_responses enable row level security;

create policy "workspace members select survey_responses"
  on public.survey_responses for select
  using (exists (select 1 from public.profiles where workspace_id = survey_responses.workspace_id and id = auth.uid()));

create policy "service inserts survey_responses"
  on public.survey_responses for insert
  with check (true);  -- validado por RPC security definer con token

comment on table public.loyalty_programs   is 'Sprint 16: programa de fidelización configurable por workspace.';
comment on table public.loyalty_transactions is 'Sprint 16: historial de puntos ganados/canjeados por cliente.';
comment on table public.loyalty_rewards    is 'Sprint 16: catálogo de recompensas canjeables.';
comment on table public.reviews            is 'Sprint 16: calificaciones 1-5 estrellas de clientes.';
comment on table public.review_responses   is 'Sprint 16: respuestas de la empresa a reseñas.';
comment on table public.surveys            is 'Sprint 16: encuestas de satisfacción configurables.';
comment on table public.survey_responses   is 'Sprint 16: respuestas de clientes con NPS.';
