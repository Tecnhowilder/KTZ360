# PEDIDOS — ERRORES ENCONTRADOS Y CORRECCIONES

**Fecha:** 2026-06-26  
**Sprint:** Estabilización Total

---

## ERROR 1 — assign_order devuelve HTTP 400

### Causa raíz
La función `assign_order` no existía en la base de datos porque la migration 0106 no había sido aplicada al proyecto de Supabase. PostgREST devuelve HTTP 400 cuando llama a una función inexistente.

Adicionalmente, el constraint `orders_status_check` definido inline en migration 0050 tiene el nombre auto-generado por PostgreSQL. Si migration 0106 (que hace `DROP CONSTRAINT IF EXISTS orders_status_check`) se aplica cuando el constraint aún existe con ese nombre exacto, la secuencia funciona. Sin embargo, si el constraint fue creado con un nombre diferente (variación de versión de PostgreSQL), el DROP silencioso deja el constraint viejo intacto y el nuevo `assign_order` falla al intentar cambiar status a 'asignado' por violación del constraint original.

### Archivos afectados
- `supabase/migrations/0050_orders_schema.sql` — constraint original (INLINE, nombre auto-generado)
- `supabase/migrations/0106_orders_extended_flow.sql` — primera versión del fix (DROP IF EXISTS puede fallar silencioso)

### Corrección aplicada
**`supabase/migrations/0107_pedidos_production_ready.sql`**

```sql
-- Eliminar TODOS los CHECK constraints de la tabla orders (sin asumir nombre)
DO $$
DECLARE v_con RECORD;
BEGIN
  FOR v_con IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

-- Agregar constraint limpio con todos los estados válidos
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN (...));
```

También se reescribió `assign_order` con validación de `status='active'` del técnico y lógica de log mejorada.

### Pasos para aplicar
1. Ejecutar migration 0106 en Supabase SQL Editor
2. Ejecutar migration 0107 en Supabase SQL Editor
3. Verificar que `SELECT * FROM pg_constraint WHERE conrelid='orders'::regclass AND contype='c'` muestra solo 2 constraints: `orders_status_check` y `orders_source_check`

---

## ERROR 2 — send-email devuelve HTTP 400

### Causa raíz (A): Resend no configurado
La Edge Function `send-email` lee la API key de `system_configuration.key='resend'`. Si ese registro no existe, la función devuelve HTTP 501. Si existe pero con valores incorrectos, Resend API devuelve 400 que se propaga.

### Causa raíz (B): Template desconocido (HTTP 400 directo)
Si el payload enviado incluye un `template` que no existe en `templates.ts`, la función devuelve HTTP 400 `unknown_template`.

### Corrección aplicada
**Migration 0107:** Inserta placeholder de configuración Resend (no sobrescribe si ya existe):
```sql
INSERT INTO system_configuration (key, value)
VALUES ('resend', '{"api_key":"","from_email":"no-reply@shelwi.app",...}')
ON CONFLICT (key) DO NOTHING;
```

**Acción manual requerida:** El operador debe configurar la API key de Resend:
```sql
UPDATE system_configuration 
SET value = jsonb_set(value, '{api_key}', '"re_xxxxx"')
WHERE key = 'resend';
```

### Nota importante
La Edge Function tiene failsafe: si el email falla, la invitación ya fue creada en DB y el enlace `/invite/{token}` sirve como respaldo. El HTTP 400 en send-email NO rompe el flujo de invitación — solo significa que el email no fue enviado.

---

## ERROR 3 — invite_team_member: invalid_role con roles operario/supervisor

### Causa raíz
La función original en `0020_roles_team_management.sql` solo acepta `('admin', 'employee')`. Sin embargo, **migration 0056** ya corrige esto con `CREATE OR REPLACE FUNCTION` que acepta `('admin', 'supervisor', 'comercial', 'operario')`.

### Estado
✅ Ya corregido por migration 0056 si está aplicada.  
⚠️ Si migration 0056 no ha sido aplicada al proyecto, se debe aplicar primero.

---

## ERROR 4 — OT no heredaba el técnico asignado al pedido

### Causa raíz
En `PedidoDetailPage.tsx`, la llamada `createWO.mutateAsync({ orderId, title })` no pasaba el `assignedTo`. La OT se creaba sin técnico incluso cuando el pedido padre lo tenía.

### Corrección (Frontend)
```tsx
// ANTES:
await createWO.mutateAsync({ orderId: order.id, title: woTitle.trim() });

// DESPUÉS (ya en el archivo):
await createWO.mutateAsync({
  orderId:    order.id,
  title:      woTitle.trim(),
  assignedTo: order.assigned_to ?? undefined,
});
```

### Corrección (Backend — migration 0107)
El RPC `create_work_order` ahora usa `COALESCE(p_assigned_to, v_order.assigned_to)` para heredar automáticamente incluso si el frontend no lo envía. Doble protección.

---

## ERROR 5 — AssignTechSheet mostraba miembros de workspaces ajenos (teórico)

### Causa raíz
La query usaba `eq('workspace_id', workspace.id)` lo cual es correcto. Sin embargo, dependía de que el `workspace.id` del contexto fuera correcto. Zero Trust exige que la validación sea en backend.

### Corrección
Migration 0107 incluye `get_assignable_members()` RPC que hace la validación desde el JWT del servidor. La query del frontend ya incluye filtro por `status IN ('active','invited')` para excluir usuarios suspendidos/eliminados.

---

## ERROR 6 — useOrders llamado con 2 parámetros (TypeScript error)

### Causa raíz
El archivo `Pedidos.tsx` fue actualizado por el linter/usuario para llamar `useOrders(filter, debouncedSearch)`, pero el hook original solo acepta 1 parámetro. Esto generaba error TS2345.

### Corrección
```tsx
// ANTES (error):
const { data: orders = [], isLoading } = useOrders(filter, debouncedSearch || undefined);

// DESPUÉS (correcto):
const { data: orders = [], isLoading, error } = useOrders(filter);
const filtered = orders.filter(o => !debouncedSearch || ...client-side filter...);
```

---

## ERROR 7 — inviteTeamMember: workspaceName faltante

### Causa raíz
`InviteTeamMemberInput` interface requiere `workspaceName: string`. La llamada en `PedidoDetailPage.tsx` no lo incluía → error TypeScript.

### Corrección
```tsx
await inviteTeamMember({
  ...,
  workspaceName: 'tu equipo',  // fallback genérico (no disponible en contexto del sheet)
});
```

---

## RESUMEN DE ARCHIVOS MODIFICADOS

| Archivo | Tipo de cambio |
|---------|---------------|
| `supabase/migrations/0106_orders_extended_flow.sql` | Nuevo (constraint + assign_order + get_order) |
| `supabase/migrations/0107_pedidos_production_ready.sql` | Nuevo (bulletproof fixes + source + OT inheritance + notifications) |
| `src/views/PedidoDetailPage.tsx` | Fix: workspaceName + source detection + OT assignedTo |
| `src/views/Pedidos.tsx` | Fix: useOrders params + error var + local search filter |
| `src/services/workOrders.ts` | Nuevos status labels/colors (asignado, en_ruta, en_sitio, facturado) |
