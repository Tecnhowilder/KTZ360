-- ============================================================
-- Migration 0115 — PREMIUM: included_users 5 → 12
--
-- El plan PREMIUM ahora incluye 12 usuarios base en lugar de 5.
-- Esto resuelve el falso "Límite alcanzado" cuando se tienen
-- invitaciones pendientes que consumen cupo.
-- ============================================================

UPDATE public.plan_limits
   SET included_users = 12,
       updated_at     = now()
 WHERE plan_code = 'premium';

-- ENTERPRISE también pasa a 20
UPDATE public.plan_limits
   SET included_users = 20,
       updated_at     = now()
 WHERE plan_code = 'enterprise';
