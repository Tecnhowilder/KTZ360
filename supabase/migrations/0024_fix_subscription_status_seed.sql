-- KTZ360 — Corrige el status de las suscripciones de los usuarios de prueba
-- Pegar manualmente en el editor SQL de Supabase.
--
-- Bug: el trigger trg_subscriptions_normalize_status (0016) convierte
-- cualquier insert con status='active' + plan free a 'trial_active'.
-- handle_new_user() siempre inserta primero con plan free (0022), y el seed
-- (0021) hace un update posterior de plan_id que NO pasa por el trigger de
-- insert — por lo tanto los 7 usuarios de prueba (incluidos premium/pro)
-- quedaron con status='trial_active' en vez de 'active'.
--
-- Esta migración corrige el estado a 'active' solo para los workspaces de
-- los 7 usuarios de prueba. No modifica el trigger (el comportamiento de
-- altas reales queda fuera de este bloque).

update public.subscriptions s
set status = 'active'
from public.profiles p, auth.users u
where s.workspace_id = p.workspace_id
  and p.id = u.id
  and u.email in (
    'superadmin@ktz360.com','owner@test.ktz360.com','admin@test.ktz360.com',
    'employee@test.ktz360.com','premium@test.ktz360.com','pro@test.ktz360.com',
    'free@test.ktz360.com'
  )
  and s.status = 'trial_active';
