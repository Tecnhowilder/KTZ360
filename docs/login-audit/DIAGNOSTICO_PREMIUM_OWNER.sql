-- ============================================================
-- DIAGNÓSTICO — premium.owner@shelwi.test "no encuentra mi perfil"
-- Solo lectura. Ejecutar en Supabase SQL Editor y compartir el resultado.
-- ============================================================

-- 1. ¿Existe el usuario en auth.users? (confirma que el login con password funciona)
SELECT id, email, created_at, email_confirmed_at, deleted_at
FROM auth.users
WHERE email = 'premium.owner@shelwi.test';

-- 2. ¿Existe su perfil? (si esto devuelve 0 filas, confirma la causa exacta)
SELECT id, workspace_id, role, status, full_name, email, created_at, updated_at
FROM public.profiles
WHERE id = (SELECT id FROM auth.users WHERE email = 'premium.owner@shelwi.test');

-- 3. ¿Su workspace sigue existiendo (huérfano, sin perfil apuntándole)?
SELECT id, name, current_plan_id, created_by
FROM public.workspaces
WHERE created_by = (SELECT id FROM auth.users WHERE email = 'premium.owner@shelwi.test');

-- 4. Rastro en auditoría: ¿hay un evento que explique la eliminación?
SELECT action, metadata, created_at
FROM public.audit_log
WHERE (metadata->>'email' = 'premium.owner@shelwi.test')
   OR (entity_type = 'profiles' AND user_id = (SELECT id FROM auth.users WHERE email = 'premium.owner@shelwi.test'))
ORDER BY created_at DESC
LIMIT 20;

-- 5. Repetir 1-2 para TODOS los usuarios semilla, de un vistazo:
SELECT
  u.email,
  u.id            AS auth_user_id,
  p.id            AS profile_id,
  p.status,
  p.role,
  p.workspace_id,
  CASE WHEN p.id IS NULL THEN '❌ SIN PERFIL' ELSE '✅ OK' END AS diagnostico
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email LIKE '%@shelwi.test'
ORDER BY u.email;
