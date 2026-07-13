-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0127: Security Hardening — GPS RLS
-- ════════════════════════════════════════════════════════════════════════════
-- Problema: gps_events y member_locations tenían políticas INSERT/UPDATE que
-- permitían escritura directa por cualquier usuario autenticado, bypaseando
-- las validaciones de los RPCs (consentimiento GPS, feature gate, precisión,
-- actualización de estado operativo, notificaciones, etc.)
--
-- Solución: eliminar esas políticas. Los RPCs existentes (record_check_in,
-- record_check_out, record_pausa, record_reanudacion, update_location_manual,
-- update_location_if_active, etc.) son SECURITY DEFINER y se ejecutan como
-- el rol `postgres`, que bypass RLS por ser superusuario. No se rompe nada.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── gps_events: eliminar política de inserción directa ──────────────────────
-- RPCs de escritura: record_check_in, record_check_out, record_pausa,
-- record_reanudacion, update_location_manual, update_location_if_active.
-- Todos son SECURITY DEFINER → ejecutan como postgres → bypass RLS.
DROP POLICY IF EXISTS "gps_events_insert" ON public.gps_events;

-- ─── member_locations: eliminar políticas de escritura directa ───────────────
-- RPCs de escritura: record_check_in, record_check_out, update_location_manual,
-- update_location_if_active. Todos SECURITY DEFINER → bypass RLS.
DROP POLICY IF EXISTS "member_locations_service_insert" ON public.member_locations;
DROP POLICY IF EXISTS "member_locations_service_update" ON public.member_locations;
