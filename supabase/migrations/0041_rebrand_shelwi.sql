-- ============================================================================
-- 0041 — rebrand_shelwi: Actualización oficial de nombre a Shelwi
-- Reemplaza todas las referencias a KTZ360, KTZ-360, Brivia en datos de DB
-- ============================================================================

-- 1. Actualizar descriptions de planes
update public.plans set
  description = 'Cotizaciones, Clientes, Catálogo, PDF profesional, Portal público'
where code = 'free';

update public.plans set
  description = 'CRM comercial + IA con créditos (500/mes) + Reportes avanzados + PDF white-label'
where code = 'pro';

update public.plans set
  description = 'Todo PRO + Operaciones (Pedidos, OT, Bitácora, Evidencias, GPS) + 5 usuarios + 2000 créditos IA'
where code = 'premium';

-- 2. Actualizar nombre de la app en system_configuration si existe
update public.system_configuration set
  value = jsonb_set(coalesce(value, '{}'::jsonb), '{app_name}', '"Shelwi"')
where key = 'app' and value->>'app_name' ilike '%ktz%';

-- 3. Actualizar admin settings si tiene referencias KTZ360
update public.admin_settings set
  value = replace(value::text, 'KTZ360', 'Shelwi')::jsonb
where value::text ilike '%ktz360%';

-- 4. Comentario de rebrand
comment on table public.plans is 'Planes Shelwi: FREE / PRO / PREMIUM. Rebrand desde KTZ360 en migración 0041.';
