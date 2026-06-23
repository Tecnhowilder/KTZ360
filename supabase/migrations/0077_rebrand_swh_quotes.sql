-- ============================================================================
-- 0077 — rebrand_shw_quotes: Migración final de marca BRI- → SHW-
-- ============================================================================
-- SHELWI — Sprint 16.2 Hardening
--
-- REGLA CRÍTICA: No se modifican quotes históricas con BRI-.
-- Solo las NUEVAS cotizaciones usarán SHW-.
-- El histórico queda intacto — numeración BRI- de clientes anteriores es válida.
--
-- Cambios:
--   1. next_quote_number() retorna 'SHW-YYYY-NNNNNN' (antes 'BRI-YYYY-NNNNNN')
--   2. Descripción legacy 'Brivia IA' en plan premium → actualizada
--   3. next_order_number() y next_work_order_number() ya usan 'ORD-' y 'OT-' ✓
-- ============================================================================

-- ─── 1. Actualizar función next_quote_number() ────────────────────────────────
-- Antes: 'BRI-' || v_year::text || '-' || lpad(v_number::text, 6, '0')
-- Ahora: 'SHW-' || v_year::text || '-' || lpad(v_number::text, 6, '0')

create or replace function public.next_quote_number(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   int := extract(year from now())::int;
  v_number int;
begin
  insert into public.workspace_quote_counters (workspace_id, year, last_number)
  values (p_workspace_id, v_year, 1)
  on conflict (workspace_id, year)
  do update set last_number = public.workspace_quote_counters.last_number + 1
  returning last_number into v_number;

  -- SHW- reemplaza BRI- como prefijo oficial de Shelwi
  return 'SHW-' || v_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

-- ─── 2. Actualizar descripción del plan PREMIUM (referencia a 'Brivia IA') ───

update public.plans
set description = 'Todo PRO + Operaciones (Pedidos, OT, Bitácora, Evidencias, GPS) + 5 usuarios + 2000 créditos Shelwi IA'
where code = 'premium'
  and description ilike '%Brivia%';

-- También asegurar que plan pro no tiene referencias antiguas
update public.plans
set description = 'CRM comercial + Shelwi IA con créditos + Reportes avanzados + PDF white-label'
where code = 'pro'
  and (description ilike '%KTZ%' or description ilike '%Brivia%');

-- ─── 3. Limpiar referencias legacy en system_configuration si existen ─────────

update public.system_configuration
set value = jsonb_set(
  coalesce(value, '{}'::jsonb),
  '{app_name}',
  '"Shelwi"'
)
where key = 'app'
  and (value->>'app_name' ilike '%ktz%'
    or value->>'app_name' ilike '%brivia%'
    or value->>'app_name' ilike '%BRI%');

-- ─── 4. Limpiar referencias en admin_settings si existen ──────────────────────

update public.admin_settings
set value = replace(
  replace(value::text, 'BRI-', 'SHW-'),
  'Brivia', 'Shelwi'
)::jsonb
where (value::text ilike '%BRI-%' or value::text ilike '%Brivia%')
  and key not in ('changelog', 'history');  -- no tocar documentación interna

-- ─── 5. Actualizar quotes_set_number trigger function ────────────────────────
-- El trigger llama next_quote_number() que ya fue actualizado.
-- La función del trigger no necesita cambios.

-- ─── Verificación de estado ───────────────────────────────────────────────────

do $$
declare
  v_sample text;
begin
  -- Simular el nuevo formato (sin consumir el contador real)
  v_sample := 'SHW-' || extract(year from now())::text || '-000001';
  raise notice 'Nuevo formato de cotizaciones: %', v_sample;
  raise notice 'Cotizaciones históricas con BRI- NO fueron modificadas.';
end;
$$;

comment on function public.next_quote_number(uuid)
  is 'Sprint 16.2: retorna SHW-YYYY-NNNNNN. Antes retornaba BRI-YYYY-NNNNNN (marca Brivia/anterior).';
