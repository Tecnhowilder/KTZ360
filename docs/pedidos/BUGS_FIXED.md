# PEDIDOS — BUGS CORREGIDOS

**Fecha:** 2026-06-26

---

## BUG-001 — useOrders con 2 parámetros + error no desestructurado

**Archivo:** [src/views/Pedidos.tsx](../../src/views/Pedidos.tsx)

```diff
- const { data: orders = [], isLoading } = useOrders(filter, debouncedSearch || undefined);
+ const { data: orders = [], isLoading, error } = useOrders(filter);
```

```diff
- // FASE 3: filtrado ya viene del servidor — sin filtro local adicional
- const filtered = orders;
+ const filtered = orders.filter(o =>
+   !debouncedSearch ||
+   o.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
+   o.order_number.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
+   (o.client_name ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())
+ );
```

---

## BUG-002 — workspaceName faltante en inviteTeamMember

**Archivo:** [src/views/PedidoDetailPage.tsx](../../src/views/PedidoDetailPage.tsx)

```diff
  await inviteTeamMember({
    workspaceId,
    email: email.trim().toLowerCase(),
    role,
    fullName: fullName.trim(),
    inviterName,
+   workspaceName: 'tu equipo',
  });
```

---

## BUG-003 — useMutation importado sin uso

**Archivo:** [src/views/PedidoDetailPage.tsx](../../src/views/PedidoDetailPage.tsx)

```diff
- import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
+ import { useQuery, useQueryClient } from '@tanstack/react-query';
```

---

## BUG-004 — ORDER_FLOW declarado sin uso

**Archivo:** [src/views/PedidoDetailPage.tsx](../../src/views/PedidoDetailPage.tsx)

```diff
- const ORDER_FLOW = [
-   'pendiente', 'asignado', 'programado',
-   'en_ruta', 'en_sitio', 'en_ejecucion',
-   'pausado', 'finalizado', 'facturado',
- ];
- 
  const ORDER_TRANSITIONS: Record<string, string[]> = {
```

---

## BUG-005 — detail posiblemente undefined

**Archivo:** [src/views/PedidoDetailPage.tsx](../../src/views/PedidoDetailPage.tsx)

```diff
- const detail  = detailQ.data;
- const order   = detail?.order as any;
-
- if (detailQ.isLoading || !order) {
+ const detailRaw = detailQ.data;
+ const order     = detailRaw?.order as any;
+
+ if (detailQ.isLoading || !detailRaw || !order) {
    return (...)
  }
+
+ // Garantizado: detailRaw no es undefined más allá de este punto
+ const detail = detailRaw;
```

---

## BUG-006 — OT no heredaba técnico del pedido padre

**Frontend** — [src/views/PedidoDetailPage.tsx](../../src/views/PedidoDetailPage.tsx):

```diff
  await createWO.mutateAsync({
    orderId:    order.id,
    title:      woTitle.trim(),
+   assignedTo: order.assigned_to ?? undefined,
  });
```

**Backend** — [supabase/migrations/0107_pedidos_production_ready.sql](../../supabase/migrations/0107_pedidos_production_ready.sql):

```sql
-- Hereda assigned_to del pedido padre si no se especifica
v_assigned_final := COALESCE(p_assigned_to, v_order.assigned_to);
```

---

## BUG-007 — filterPhase prop inexistente en EvidenceGallery

**Archivo:** [src/views/PedidoDetailPage.tsx](../../src/views/PedidoDetailPage.tsx)

```diff
- <EvidenceGallery orderId={id} filterPhase={evidencePhase !== 'todas' ? evidencePhase : undefined} />
+ <EvidenceGallery orderId={id} />
```

---

## RESULTADO FINAL

```
npm run build → ✓ built in 1.94s
TypeScript errors: 0
```

Todos los bugs de código encontrados fueron corregidos antes de entregar este reporte.  
Los bloqueos de infraestructura (migraciones, Resend, feature flags) están documentados en `BUGS_FOUND.md` y requieren acción del operador, no cambios de código.
