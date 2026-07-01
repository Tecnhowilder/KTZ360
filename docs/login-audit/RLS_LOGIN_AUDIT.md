# AUDITORÍA RLS — Políticas Durante Login

## Política activa en `profiles` (SELECT)

```sql
-- migration 0003_rls.sql
CREATE POLICY "profiles_select_workspace" ON public.profiles
  FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace_id());
```

## Función `current_workspace_id()` — EL PROBLEMA

```sql
-- migration 0020_roles_team_management.sql
CREATE OR REPLACE FUNCTION public.current_workspace_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT workspace_id FROM public.profiles
   WHERE id = auth.uid() AND status = 'active';  -- ← filtro por status
$$;
```

## Árbol de evaluación RLS

```
Usuario autenticado intenta: SELECT * FROM profiles WHERE id = $userId

RLS evalúa: workspace_id = current_workspace_id()

current_workspace_id() ejecuta (SECURITY DEFINER, sin RLS):
  SELECT workspace_id FROM profiles WHERE id = auth.uid() AND status = 'active'

SI status = 'active':
  → devuelve UUID del workspace
  → RLS pasa: workspace_id = UUID → TRUE para la fila del usuario
  → 1 fila retornada → .single() → 200 OK ✅

SI status != 'active' (invited, inactive, removed):
  → devuelve NULL
  → RLS: workspace_id = NULL → NULL (no TRUE, no FALSE) → FALSE
  → 0 filas retornadas → .single() → 406 ❌
```

## Todos los estados de perfil posibles

| status | current_workspace_id() | Puede leer su profile |
|--------|------------------------|----------------------|
| active | UUID del workspace | ✅ SÍ |
| inactive | NULL | ❌ NO |
| removed | NULL | ❌ NO |
| invited | NULL | ❌ NO (si existe tal estado) |

## Política FALTANTE (la que debería existir)

```sql
-- Esta política no existe actualmente:
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
```

Esta política permitiría que CUALQUIER usuario autenticado lea su propio perfil,
independientemente del status. Esto es lo mínimo necesario para que el login funcione.

## Impacto en la arquitectura Zero Trust

La corrección NO rompe Zero Trust porque:
- El usuario solo puede ver SU PROPIA fila (id = auth.uid())
- No puede ver perfiles de otros usuarios
- La política de workspace sigue existiendo para ver el equipo
- El workspace_id sigue siendo la fuente de verdad del contexto
