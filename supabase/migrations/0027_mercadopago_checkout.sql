-- ---------------------------------------------------------------------------
-- Mercado Pago Checkout Pro: billing_cycle en subscriptions + payment_events
-- ---------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'annual'));

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  plan_code text,
  billing_cycle text,
  status text not null,
  amount numeric(12, 2),
  currency_code text default 'COP',
  event_type text not null default 'payment',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (payment_id, status)
);

create index idx_payment_events_workspace on public.payment_events(workspace_id, created_at desc);

alter table public.payment_events enable row level security;

create policy "payment_events_select_support_admin"
  on public.payment_events for select
  using (public.is_support_admin());
