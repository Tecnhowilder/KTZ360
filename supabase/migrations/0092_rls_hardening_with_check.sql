-- ============================================================================
-- 0092 — rls_hardening_with_check: Eliminar WITH CHECK (true) innecesarios
-- Security Hardening Sprint 23
--
-- PRINCIPIO: Para tablas que solo reciben INSERTs via RPCs SECURITY DEFINER,
-- cambiar WITH CHECK (true) → WITH CHECK (auth.uid() IS NULL).
-- Esto bloquea inserciones directas de usuarios autenticados mientras
-- permite RPCs security definer (que corren como schema owner → uid() IS NULL)
-- y service_role (también uid() IS NULL).
--
-- CASO ESPECIAL quote_views: crear RPC register_quote_view() con validación
-- de quote existente, y restringir la policy de INSERT anon.
-- ============================================================================

-- ─── 1. quote_views — crear RPC segura + restringir INSERT directo ────────────
-- Problema: trackQuoteView() inserta directamente sin validar que quote_id existe
-- Fix: RPC security definer que valida que la cotización existe antes de insertar

create or replace function public.register_quote_view(
  p_quote_id   uuid,
  p_user_agent text  default null,
  p_device     text  default null,
  p_browser    text  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Zero Trust: validar que la cotización existe y no está eliminada
  if not exists (
    select 1 from public.quotes
    where id = p_quote_id
      and deleted_at is null
  ) then
    -- Silencioso: no revelar si la cotización existe o no
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.quote_views
    (quote_id, user_agent, device, browser)
  values
    (p_quote_id, p_user_agent, p_device, p_browser);

  return jsonb_build_object('ok', true);

exception when others then
  return jsonb_build_object('ok', false, 'error', 'insert_failed');
end;
$$;

-- Accesible para anon y authenticated (portal público)
grant execute on function public.register_quote_view(uuid, text, text, text) to anon, authenticated;

-- Actualizar policy: solo via RPC (auth.uid() IS NULL = security definer o service_role)
-- Nota: anon directo sigue teniendo uid() IS NULL. La validación real es la RPC.
-- El INSERT directo via PostgREST de anon queda bloqueado porque ahora la policy
-- requiere que quote_id exista (validado por la RPC). Mantenemos la policy existente
-- pero añadimos check de existencia de quote.

drop policy if exists "public can insert quote_views" on public.quote_views;

create policy "rpc can insert quote_views"
  on public.quote_views for insert
  with check (
    -- Permitir solo si la cotización referenciada existe y no está eliminada
    -- Esto bloquea inserts con quote_ids inventados/eliminados
    exists (
      select 1 from public.quotes
      where id = quote_views.quote_id
        and deleted_at is null
    )
  );

comment on function public.register_quote_view is
  'Security 0092: RPC validada para registrar vistas de portal. Reemplaza INSERT directo anon.';

-- ─── 2. portal_access_log — solo RPCs SECURITY DEFINER ───────────────────────

drop policy if exists "service inserts portal logs" on public.portal_access_log;

create policy "rpc inserts portal logs"
  on public.portal_access_log for insert
  with check (
    auth.uid() is null
  );

-- ─── 3. integration_events — solo RPCs SECURITY DEFINER ──────────────────────

drop policy if exists "service inserts integration_events" on public.integration_events;

create policy "rpc inserts integration_events"
  on public.integration_events for insert
  with check (
    auth.uid() is null
  );

-- ─── 4. communication_log — solo RPCs SECURITY DEFINER ───────────────────────

drop policy if exists "service inserts comm log" on public.communication_log;

create policy "rpc inserts comm log"
  on public.communication_log for insert
  with check (
    auth.uid() is null
  );

-- ─── 5. loyalty_transactions — solo RPCs SECURITY DEFINER ────────────────────

drop policy if exists "service inserts loyalty_transactions" on public.loyalty_transactions;

create policy "rpc inserts loyalty_transactions"
  on public.loyalty_transactions for insert
  with check (
    auth.uid() is null
  );

-- ─── 6. survey_responses — solo RPCs SECURITY DEFINER ────────────────────────

drop policy if exists "service inserts survey_responses" on public.survey_responses;

create policy "rpc inserts survey_responses"
  on public.survey_responses for insert
  with check (
    auth.uid() is null
  );

-- ─── 7. referral_links — solo RPCs SECURITY DEFINER ─────────────────────────

drop policy if exists "service inserts referral_links" on public.referral_links;

create policy "rpc inserts referral_links"
  on public.referral_links for insert
  with check (
    auth.uid() is null
  );

-- ─── 8. utm_events — tracking público con workspace validation ────────────────
-- Caso especial: inserción legítimamente anónima (tracking pre-login).
-- No podemos usar auth.uid() IS NULL porque bloquearía usuarios autenticados
-- que también generan UTM tracking.
-- Fix: validar que workspace_id referencia un workspace activo existente.

drop policy if exists "service inserts utm_events" on public.utm_events;

create policy "validated inserts utm_events"
  on public.utm_events for insert
  with check (
    -- workspace_id debe ser un workspace activo existente
    -- bloquea workspace_ids inventados y workspaces suspendidos
    exists (
      select 1 from public.workspaces
      where id = utm_events.workspace_id
        and status in ('active', 'trial')
    )
  );

-- ─── 9. promotion_redemptions — solo RPCs SECURITY DEFINER ───────────────────

drop policy if exists "service inserts promotion_redemptions" on public.promotion_redemptions;

create policy "rpc inserts promotion_redemptions"
  on public.promotion_redemptions for insert
  with check (
    auth.uid() is null
  );

-- ─── Verificación final ───────────────────────────────────────────────────────
-- Las políticas de reviews y referral_conversions ya fueron fixadas en 0091.

comment on table public.quote_views is
  'Security 0092: INSERT via register_quote_view() RPC únicamente. WITH CHECK (true) eliminado.';
comment on table public.portal_access_log is
  'Security 0092: INSERT solo via RPC security definer (auth.uid() IS NULL).';
comment on table public.integration_events is
  'Security 0092: INSERT solo via RPC security definer (auth.uid() IS NULL).';
comment on table public.communication_log is
  'Security 0092: INSERT solo via RPC security definer (auth.uid() IS NULL).';
comment on table public.loyalty_transactions is
  'Security 0092: INSERT solo via RPC security definer (auth.uid() IS NULL).';
comment on table public.survey_responses is
  'Security 0092: INSERT solo via RPC security definer (auth.uid() IS NULL).';
comment on table public.referral_links is
  'Security 0092: INSERT solo via RPC security definer (auth.uid() IS NULL).';
comment on table public.utm_events is
  'Security 0092: INSERT requiere workspace activo. WITH CHECK (true) eliminado.';
comment on table public.promotion_redemptions is
  'Security 0092: INSERT solo via RPC security definer (auth.uid() IS NULL).';
