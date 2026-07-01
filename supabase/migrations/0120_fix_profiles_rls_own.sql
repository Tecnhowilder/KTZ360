-- ============================================================
-- Migration 0120 — Fix: política RLS profiles_select_own
--
-- CAUSA RAÍZ DEL 406:
--   La política "profiles_select_workspace" usa current_workspace_id()
--   que filtra por status='active'. Si el usuario tiene cualquier
--   otro status (invited, inactive, removed), current_workspace_id()
--   devuelve NULL, la condición workspace_id=NULL siempre es FALSE,
--   y .single() recibe 0 filas → HTTP 406.
--
-- FIX:
--   Agregar política que permite leer el PROPIO perfil siempre,
--   independientemente del status. Un usuario autenticado siempre
--   debe poder leer su propia fila.
--
-- SEGURIDAD:
--   - Solo permite leer UNA fila: la propia (id = auth.uid())
--   - No permite leer perfiles de otros usuarios
--   - La política de workspace sigue activa para ver el equipo
--   - Zero Trust intacto: el JWT sigue siendo la fuente de verdad
-- ============================================================

DO $$ BEGIN
  CREATE POLICY "profiles_select_own"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy profiles_select_own already exists — skipping';
END $$;

-- Verificación: el usuario autenticado siempre puede leer su propia fila
-- Independientemente de: status, workspace_id, role
-- Esto es el mínimo necesario para que el login funcione.
