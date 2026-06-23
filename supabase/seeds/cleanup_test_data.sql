-- ============================================================================
-- cleanup_test_data.sql — Limpieza de datos de prueba
-- ============================================================================
-- Sprint 16.2 Hardening — NO es una migración. No aplicar con supabase db push.
--
-- Propósito: Eliminar datos de prueba creados por migraciones seed:
--   - 0021_seed_test_users.sql
--   - 0023_seed_clients_free_test.sql
--
-- INSTRUCCIONES:
--   Ejecutar MANUALMENTE en Supabase SQL Editor en el entorno de PRODUCCIÓN
--   SOLO si se confirma que los emails de prueba no son clientes reales.
--
-- NUNCA ejecutar en producción sin revisar primero qué workspaces existen.
-- ============================================================================

-- ─── PASO 1: Identificar datos de prueba (REVISAR antes de eliminar) ─────────

-- Ver workspaces de prueba (confirmar antes de borrar)
select
  w.id,
  w.name,
  p.email,
  w.created_at,
  s.status as plan_status
from public.workspaces w
join public.profiles p on p.workspace_id = w.id and p.role = 'owner'
left join public.subscriptions s on s.workspace_id = w.id
where p.email ilike '%@test.%'
   or p.email ilike '%test@%'
   or p.email ilike '%seed%'
   or p.email ilike '%ktz360%'
   or p.email ilike '%free@test%'
   or p.email ilike '%pro@test%'
   or p.email ilike '%premium@test%'
order by w.created_at;

-- ─── PASO 2: SOLO si se confirma que son datos de prueba — ejecutar limpieza ──

-- INSTRUCCIÓN: Descomenta las líneas siguientes SOLO después de verificar
-- el resultado del SELECT anterior y confirmar que son datos de prueba.

/*
-- Eliminar workspaces de prueba por email del owner
-- (el ON DELETE CASCADE limpia todas las entidades relacionadas)

do $$
declare
  v_workspace_id uuid;
  v_email        text;
begin
  for v_workspace_id, v_email in
    select w.id, p.email
    from public.workspaces w
    join public.profiles p on p.workspace_id = w.id and p.role = 'owner'
    where p.email ilike '%@test.%'
       or p.email ilike '%ktz360%'
  loop
    raise notice 'Eliminando workspace % (owner: %)', v_workspace_id, v_email;
    -- Soft approach: marcar como cancelado en lugar de borrar físico
    update public.workspaces set status = 'cancelled' where id = v_workspace_id;
  end loop;
end;
$$;
*/

-- ─── PASO 3: Verificar que auth.users de prueba están limpiados ──────────────

-- NOTA: Los usuarios de auth.users se eliminan desde Supabase Dashboard
-- Authentication → Users → filtrar por email → eliminar
-- O via API de Supabase Admin con service_role key.

-- No se puede eliminar desde SQL Editor por razones de seguridad de Supabase.

select
  'Revisión completada. Ver instrucciones arriba para limpiar auth.users.' as status,
  'Archivos seed NO modificados (0021, 0023, 0024) — conservados como documentación.' as nota;
