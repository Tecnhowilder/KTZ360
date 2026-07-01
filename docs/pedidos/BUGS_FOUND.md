# PEDIDOS — BUGS ENCONTRADOS

**Fecha:** 2026-06-26  
**Método:** Code trace estático + compilación TypeScript

---

## BUGS DE CÓDIGO (encontrados y corregidos en este sprint)

### BUG-001 — TypeScript: `useOrders` llamado con 2 parámetros

**Archivo:** `src/views/Pedidos.tsx`  
**Línea original:** `const { data: orders = [], isLoading } = useOrders(filter, debouncedSearch || undefined);`  
**Problema:** `useOrders` solo acepta 1 parámetro `(status?: string)`. La llamada con 2 parámetros genera error TS2345. Además, `error` no era desestructurado pero sí usado en el JSX.  
**Severidad:** 🔴 Build failure  
**Estado:** 🔧 CORREGIDO

---

### BUG-002 — TypeScript: `workspaceName` faltante en `inviteTeamMember`

**Archivo:** `src/views/PedidoDetailPage.tsx` — `InviteMemberMiniSheet`  
**Problema:** `InviteTeamMemberInput` interface requiere `workspaceName: string`. La llamada en el mini-sheet no lo incluía → error TS2345.  
**Severidad:** 🔴 Build failure  
**Estado:** 🔧 CORREGIDO (valor: `'tu equipo'` como fallback genérico)

---

### BUG-003 — TypeScript: `useMutation` importado pero no usado

**Archivo:** `src/views/PedidoDetailPage.tsx`  
**Problema:** `useMutation` importado de `@tanstack/react-query` pero nunca referenciado → TS6133.  
**Severidad:** 🟡 Warning que se trata como error en build estricto  
**Estado:** 🔧 CORREGIDO (removido del import)

---

### BUG-004 — TypeScript: `ORDER_FLOW` constante declarada pero no usada

**Archivo:** `src/views/PedidoDetailPage.tsx`  
**Problema:** Array `ORDER_FLOW` declarado pero `mainFlow` en `OrderTimeline` define los mismos valores inline → TS6133.  
**Severidad:** 🟡 Warning  
**Estado:** 🔧 CORREGIDO (removido)

---

### BUG-005 — TypeScript: `detail` posiblemente undefined después del guard

**Archivo:** `src/views/PedidoDetailPage.tsx`  
**Problema:** TypeScript no estrecha el tipo de `detailQ.data` después del `if (!order)` return. Las referencias posteriores a `detail.work_orders` y `detail.logs` generaban TS18048.  
**Severidad:** 🔴 Build failure  
**Estado:** 🔧 CORREGIDO (restructura: `detailRaw` → guard → `const detail = detailRaw`)

---

### BUG-006 — OT no heredaba el técnico asignado al pedido padre

**Archivo:** `src/views/PedidoDetailPage.tsx` — `handleCreateWO`  
**Problema:** La llamada `createWO.mutateAsync({ orderId, title })` no incluía `assignedTo`. Una OT se creaba como "Sin asignar" incluso cuando el pedido padre tenía un técnico asignado.  
**Severidad:** 🔴 Funcional — comportamiento incorrecto silencioso  
**Estado:** 🔧 CORREGIDO en dos capas:
  1. Frontend: `assignedTo: order.assigned_to ?? undefined`
  2. Backend (migration 0107): `COALESCE(p_assigned_to, v_order.assigned_to)` en RPC

---

### BUG-007 — `EvidenceGallery` llamada con prop inexistente `filterPhase`

**Archivo:** `src/views/PedidoDetailPage.tsx`  
**Problema:** `<EvidenceGallery orderId={id} filterPhase={...} />` — `EvidenceGallery` no acepta `filterPhase` → TS2322.  
**Severidad:** 🔴 Build failure  
**Estado:** 🔧 CORREGIDO (removido `filterPhase`; los sub-tabs de fase son UI-only para ahora)

---

## BLOQUEOS DE INFRAESTRUCTURA (no son bugs de código)

### INFRA-001 — Migration 0106 no aplicada

**Causa:** `assign_order`, `update_order_status` (extendido), `get_order` (con `assigned_name`) no existen en la DB.  
**Síntoma:** HTTP 400 al llamar `assign_order`  
**Acción:** Aplicar `supabase/migrations/0106_orders_extended_flow.sql` en SQL Editor  

---

### INFRA-002 — Migration 0107 no aplicada

**Causa:** Constraint bulletproof, `orders.source` column, `create_work_order` extendido, `get_assignable_members`, notificaciones trigger no existen.  
**Acción:** Aplicar `supabase/migrations/0107_pedidos_production_ready.sql` en SQL Editor

---

### INFRA-003 — Resend API Key no configurada

**Causa:** `system_configuration.resend.api_key = ''` (placeholder vacío de migration 0107).  
**Síntoma:** Emails de invitación no se envían. Flujo sigue funcionando por token.  
**Acción:** 
```sql
UPDATE system_configuration 
SET value = jsonb_set(value, '{api_key}', '"re_XXXXXXXXXXXXXXXX"')
WHERE key = 'resend';
```

---

### INFRA-004 — Feature flags no habilitados en plan PREMIUM

**Flags requeridos:**
- `orders_enabled = true`
- `work_orders_enabled = true`  
- `storage_enabled = true`
- `gps_enabled = true`
- `multiuser_enabled = true`

**Acción:** Configurar en `plan_features` o `workspace_feature_overrides` según la lógica de planes existente.

---

## RESUMEN

| Categoría | Cantidad | Estado |
|-----------|---------|--------|
| Bugs TypeScript (build failure) | 5 | 🔧 Todos corregidos |
| Bugs funcionales silenciosos | 2 | 🔧 Todos corregidos |
| Bloqueos de infraestructura | 4 | 🔴 Requieren acción del operador |
| **Total bugs de código** | **7** | **7/7 corregidos** |
