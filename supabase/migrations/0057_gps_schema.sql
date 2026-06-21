-- ============================================================================
-- 0057 — gps_schema: Campos GPS en profiles + member_locations + gps_events
-- ============================================================================
-- Decisiones aprobadas:
--   - operational_status en profiles (O(1), valores: off/disponible/en_ruta/en_sitio/finalizado)
--   - phone en profiles
--   - gps_consent_at en profiles (obligatorio antes de registrar coordenadas)
--   - member_locations: UPSERT, una fila por usuario (última ubicación conocida)
--   - gps_events: histórico de eventos GPS
--   - NO watchPosition() — solo one-shot (check_in, check_out, status_change, manual)
--   - Validar accuracy ≤ 500m antes de guardar
-- ============================================================================

-- ─── 1. Nuevas columnas en profiles ──────────────────────────────────────────

alter table public.profiles
  add column if not exists phone             text,
  add column if not exists operational_status text not null default 'off'
    check (operational_status in ('off','disponible','en_ruta','en_sitio','finalizado')),
  add column if not exists gps_consent_at    timestamptz;  -- null = sin consentimiento

comment on column public.profiles.phone              is 'Teléfono de contacto del miembro (visible internamente)';
comment on column public.profiles.operational_status is 'Estado operativo actual: off/disponible/en_ruta/en_sitio/finalizado';
comment on column public.profiles.gps_consent_at     is 'Fecha/hora en que el usuario aceptó el uso de GPS. NULL = sin consentimiento. Requerido antes de check-in.';

create index if not exists idx_profiles_operational
  on public.profiles(workspace_id, operational_status)
  where status = 'active';

-- ─── 2. Tabla member_locations — última ubicación conocida (UPSERT) ──────────

create table if not exists public.member_locations (
  id               uuid        primary key default gen_random_uuid(),
  workspace_id     uuid        not null references public.workspaces(id)  on delete cascade,
  user_id          uuid        not null references auth.users(id)         on delete cascade,
  latitude         numeric(10,7) not null,
  longitude        numeric(10,7) not null,
  accuracy_meters  numeric(8,2),
  source           text        not null default 'check_in' check (source in (
    'check_in', 'check_out', 'status_change', 'manual'
  )),
  order_id         uuid        references public.orders(id)      on delete set null,
  work_order_id    uuid        references public.work_orders(id) on delete set null,
  recorded_at      timestamptz not null default now(),

  -- Solo UNA fila por usuario por workspace
  constraint member_locations_unique_user unique (workspace_id, user_id)
);

create index if not exists idx_member_locations_workspace
  on public.member_locations(workspace_id, recorded_at desc);

-- RLS member_locations
alter table public.member_locations enable row level security;

-- Lectura: owner/admin/supervisor ven todos; comercial/operario solo la propia
create policy "member_locations_select"
  on public.member_locations for select
  using (
    workspace_id = public.current_workspace_id()
    and (
      public.current_user_role() in ('owner','admin','supervisor','super_admin','support_admin')
      or user_id = auth.uid()
    )
  );

-- Escritura solo vía RPCs (security definer) — no acceso directo
create policy "member_locations_service_insert"
  on public.member_locations for insert
  with check (workspace_id = public.current_workspace_id() and user_id = auth.uid());

create policy "member_locations_service_update"
  on public.member_locations for update
  using (workspace_id = public.current_workspace_id() and user_id = auth.uid());

-- ─── 3. Tabla gps_events — histórico de eventos GPS ──────────────────────────

create table if not exists public.gps_events (
  id                uuid        primary key default gen_random_uuid(),
  workspace_id      uuid        not null references public.workspaces(id) on delete cascade,
  user_id           uuid        not null references auth.users(id)        on delete cascade,
  event_type        text        not null check (event_type in (
    'check_in', 'check_out', 'status_change', 'manual_update'
  )),
  latitude          numeric(10,7),
  longitude         numeric(10,7),
  accuracy_meters   numeric(8,2),
  operational_status text,       -- estado al momento del evento
  order_id          uuid        references public.orders(id)      on delete set null,
  work_order_id     uuid        references public.work_orders(id) on delete set null,
  metadata          jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_gps_events_user
  on public.gps_events(user_id, created_at desc);
create index if not exists idx_gps_events_workspace
  on public.gps_events(workspace_id, created_at desc);
create index if not exists idx_gps_events_type
  on public.gps_events(workspace_id, event_type, created_at desc);

-- RLS gps_events
alter table public.gps_events enable row level security;

-- Lectura: owner/admin/supervisor ven todos; comercial/operario solo los propios
create policy "gps_events_select"
  on public.gps_events for select
  using (
    workspace_id = public.current_workspace_id()
    and (
      public.current_user_role() in ('owner','admin','supervisor','super_admin','support_admin')
      or user_id = auth.uid()
    )
  );

-- Escritura solo vía RPCs
create policy "gps_events_insert"
  on public.gps_events for insert
  with check (workspace_id = public.current_workspace_id() and user_id = auth.uid());

-- ─── 4. Función helper: validar coordenadas GPS ───────────────────────────────

create or replace function public.validate_gps_coords(
  p_lat      numeric,
  p_lng      numeric,
  p_accuracy numeric default null
)
returns jsonb
language plpgsql
immutable
as $$
begin
  -- Rango de latitud
  if p_lat < -90 or p_lat > 90 then
    return jsonb_build_object('ok', false, 'error', 'Latitud fuera de rango [-90, 90]');
  end if;
  -- Rango de longitud
  if p_lng < -180 or p_lng > 180 then
    return jsonb_build_object('ok', false, 'error', 'Longitud fuera de rango [-180, 180]');
  end if;
  -- Precisión máxima 500m (si se proporciona)
  if p_accuracy is not null and p_accuracy > 500 then
    return jsonb_build_object(
      'ok', false,
      'error', format('GPS con poca precisión (%s m). Requiere < 500 m. Intenta en un lugar con mejor señal.', round(p_accuracy, 0))
    );
  end if;
  -- Validar que no sean coordenadas 0,0 (null island)
  if p_lat = 0 and p_lng = 0 then
    return jsonb_build_object('ok', false, 'error', 'Coordenadas inválidas (0,0). Activa el GPS del dispositivo.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

comment on table public.member_locations is 'Sprint 8: última ubicación conocida por usuario. UPSERT — nunca histórico.';
comment on table public.gps_events       is 'Sprint 8: histórico de eventos GPS (check_in/check_out/status_change/manual_update).';
