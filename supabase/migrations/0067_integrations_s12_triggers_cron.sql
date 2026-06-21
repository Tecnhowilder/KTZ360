-- ============================================================================
-- 0067 — integrations_s12_triggers_cron: Triggers Sprint 12 + pg_cron
-- ============================================================================

-- ─── 1. Trigger: pedido finalizado → factura Alegra automática ───────────────

create or replace function public.trg_integrations_order_finalizado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = new.status then return new; end if;
  if new.status != 'finalizado' then return new; end if;

  -- Solo si Alegra está conectado y habilitado para facturación automática
  if exists (
    select 1 from public.integrations i
    where i.workspace_id = new.workspace_id
      and i.provider = 'alegra'
      and i.status = 'connected'
      and (i.config->>'auto_invoice')::boolean = true
  ) then
    -- Verificar que no hay factura ya
    if not exists (
      select 1 from public.integration_invoices
      where workspace_id = new.workspace_id and order_id = new.id
        and invoice_status not in ('void','cancelled')
    ) then
      insert into public.integration_events
        (workspace_id, provider, event_type, payload)
      values (
        new.workspace_id, 'alegra', 'invoice_create',
        jsonb_build_object('order_id', new.id, 'trigger', 'auto_on_finish')
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_auto_invoice on public.orders;
create trigger trg_order_auto_invoice
  after update of status on public.orders
  for each row execute function public.trg_integrations_order_finalizado();

-- ─── 2. Trigger: log de comunicación cuando integration_events procesa email ──
-- El worker inserta en communication_log directamente, pero este trigger
-- también puede ser útil para WhatsApp (cuando se genera la URL).

-- ─── 3. pg_cron: worker automático cada minuto ────────────────────────────────
-- IMPORTANTE: Requiere que las extensiones pg_cron y pg_net estén habilitadas.
-- Habilitar en Supabase Dashboard → Database → Extensions → pg_cron y pg_net.
-- Si no están disponibles, esta sección se omite silenciosamente.

do $$
declare
  v_cron_available boolean := false;
  v_net_available  boolean := false;
  v_supabase_url   text;
  v_service_key    text;
begin
  -- Verificar si pg_cron está disponible
  select exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) into v_cron_available;

  -- Verificar si pg_net está disponible
  select exists (
    select 1 from pg_extension where extname = 'pg_net'
  ) into v_net_available;

  if v_cron_available and v_net_available then
    -- Obtener URL de Supabase y service role key desde system_configuration
    select value->>'url'          into v_supabase_url  from public.system_configuration where key = 'app';
    select value->>'service_role' into v_service_key   from public.system_configuration where key = 'app';

    if v_supabase_url is not null and v_service_key is not null then
      -- Crear/actualizar job de cron
      perform cron.unschedule('integration-worker-auto')
        where exists (
          select 1 from cron.job where jobname = 'integration-worker-auto'
        );

      perform cron.schedule(
        'integration-worker-auto',
        '* * * * *',   -- cada minuto
        format(
          $cron$
          SELECT net.http_post(
            url := %L || '/functions/v1/integration-worker',
            headers := jsonb_build_object(
              'Authorization', 'Bearer ' || %L,
              'Content-Type', 'application/json'
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 30000
          );
          $cron$,
          v_supabase_url,
          v_service_key
        )
      );

      raise notice 'pg_cron job "integration-worker-auto" creado correctamente.';
    else
      raise notice 'pg_cron disponible pero URL/service_key no encontrados en system_configuration. Configura manualmente.';
    end if;
  else
    raise notice 'pg_cron (%) o pg_net (%) no disponibles. Configura el cron manualmente en Supabase Dashboard → Edge Functions → Schedule.',
      v_cron_available, v_net_available;
  end if;
end;
$$;

-- Alternativa: Instrucciones para configurar manualmente en Supabase Dashboard
-- Si pg_cron no está disponible, ir a:
-- Supabase Dashboard → Edge Functions → integration-worker → Schedule
-- Frecuencia: every minute (*/1 * * * *)
comment on function public.trg_integrations_order_finalizado
  is 'Sprint 12: auto-genera factura Alegra cuando pedido finaliza (si auto_invoice=true en config).';
