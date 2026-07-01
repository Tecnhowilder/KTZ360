-- ============================================================================
-- 0122 — reactivate_premium_secondary_users
-- ============================================================================
-- Contexto: el diagnóstico de login confirmó que premium.admin,
-- premium.supervisor, premium.comercial y premium.operario (workspace
-- "Empresa Premium - Test Shelwi") quedaron con status='removed' en algún
-- momento — no se pudo determinar la causa exacta (no hay coincidencia con
-- ningún patrón de limpieza conocido en las migraciones), pero según la
-- tabla de usuarios de prueba del equipo, los 4 deberían estar 'active'.
--
-- Esto, combinado con que la migración 0120 (profiles_select_own) aún no
-- estaba aplicada, producía el bug de RLS circular: current_workspace_id()
-- exige status='active', así que un perfil 'removed' no podía ver ni
-- siquiera su propia fila → la app mostraba "No encontramos tu perfil" en
-- vez de "Tu acceso fue eliminado".
--
-- Esta migración SOLO reactiva estos 4 perfiles puntuales por id — no usa
-- ningún heurístico amplio (a diferencia del DELETE de 0109 que usaba
-- ILIKE '%prueba%', un patrón fragil). Cada UPDATE queda registrado en
-- audit_log para trazabilidad, igual que haría set_team_member_status()
-- (no se puede invocar esa RPC desde el SQL Editor porque depende de
-- auth.uid(), que aquí es NULL).
-- ============================================================================

DO $$
DECLARE
  v_premium_ws uuid;
  v_owner_id   uuid;
  v_target     record;
  v_emails     text[] := ARRAY[
    'premium.admin@shelwi.test',
    'premium.supervisor@shelwi.test',
    'premium.comercial@shelwi.test',
    'premium.operario@shelwi.test'
  ];
  v_email      text;
BEGIN
  SELECT id INTO v_owner_id FROM auth.users WHERE email = 'premium.owner@shelwi.test';
  SELECT workspace_id INTO v_premium_ws FROM public.profiles WHERE id = v_owner_id;

  IF v_premium_ws IS NULL THEN
    RAISE NOTICE '⚠️  No se encontró el workspace de premium.owner@shelwi.test — nada que reparar.';
    RETURN;
  END IF;

  FOREACH v_email IN ARRAY v_emails LOOP
    SELECT p.id, p.status, p.workspace_id INTO v_target
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
     WHERE u.email = v_email;

    IF v_target.id IS NULL THEN
      RAISE NOTICE '⚠️  % no tiene perfil — omitido (no es el caso de esta migración).', v_email;
      CONTINUE;
    END IF;

    IF v_target.workspace_id != v_premium_ws THEN
      RAISE NOTICE '⚠️  % está en un workspace distinto al esperado — omitido por seguridad.', v_email;
      CONTINUE;
    END IF;

    IF v_target.status = 'active' THEN
      RAISE NOTICE 'ℹ️  % ya está active — sin cambios.', v_email;
      CONTINUE;
    END IF;

    UPDATE public.profiles
       SET status = 'active', updated_at = now()
     WHERE id = v_target.id;

    INSERT INTO public.audit_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_premium_ws, v_owner_id, 'user_reactivated', 'profiles', v_target.id,
      jsonb_build_object(
        'reason', 'seed_data_repair_0122',
        'old_status', v_target.status,
        'new_status', 'active',
        'email', v_email
      )
    );

    RAISE NOTICE '✅ Reactivado: % (status % → active)', v_email, v_target.status;
  END LOOP;
END $$;

-- ── Verificación posterior ────────────────────────────────────────────────
-- SELECT u.email, p.status, p.role
-- FROM auth.users u JOIN public.profiles p ON p.id = u.id
-- WHERE u.email LIKE 'premium.%@shelwi.test' ORDER BY u.email;
