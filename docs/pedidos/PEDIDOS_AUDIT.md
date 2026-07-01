# PEDIDOS — AUDITORÍA COMPLETA

**Fecha:** 2026-06-26  
**Sprint:** Estabilización Total — Production Ready  
**Alcance:** Módulo Pedidos de extremo a extremo

---

## 1. CREAR PEDIDO

### 1.1 Desde Cotización
| Paso | Componente | Estado | Notas |
|------|-----------|--------|-------|
| UI — botón "Desde cotización" | `Pedidos.tsx` | ✅ OK | Navega a `/app/cotizaciones` |
| UI — selección de cotización aprobada | `Cotizaciones` | ✅ OK | Solo muestra status=Aprobada |
| RPC `create_order` | `0051_orders_rpc.sql` | ✅ OK | Congela snapshot R4, genera order_number |
| FK `quote_id` | `orders.quote_id` | ✅ OK | NOT NULL para pedidos desde cotización |
| Columna `source` | `orders.source` | ✅ OK | Migration 0107: auto-set a 'from_quote' |
| React Query invalidation | `useCreateOrder` | ✅ OK | Invalida `['orders']` y dashboard |

### 1.2 Pedido Directo
| Paso | Componente | Estado | Notas |
|------|-----------|--------|-------|
| UI — botón "Nuevo pedido" | `Pedidos.tsx` | ✅ OK | Navega a `/app/pedidos/nuevo` |
| Selección de cliente | `PedidoNuevoPage` | ✅ OK | Con creación en contexto si no existe |
| RPC `create_direct_order` | `0105_ia_create_flow.sql` | ✅ OK | `quote_id=NULL`, `source='direct'` |
| Snapshot vacío | `orders.order_snapshot` | ✅ OK | No se genera (pedido directo) |
| Detección en UI | `PedidoDetailPage.isDirect` | ✅ OK | `order.source==='direct' \|\| !order.quote_id` |
| Feature gate PREMIUM | `orders_enabled` | ✅ OK | Guard en UI y validado en RPC |

---

## 2. ASIGNACIÓN DE TÉCNICO

| Paso | Componente | Estado | Notas |
|------|-----------|--------|-------|
| UI — botón "Asignar" | `AssignTechSheet` | ✅ OK | Siempre visible en header del detalle |
| Lista de miembros asignables | `profiles` query | ✅ OK | Filtra por `role IN (admin,supervisor,comercial,operario)` y `status IN (active, invited)` |
| Miembros suspendidos/eliminados | filter | ✅ OK | Excluidos por `status` |
| RPC `assign_order` | `0107_pedidos_production_ready.sql` | ✅ OK | Zero Trust, verifica workspace_id, verifica status=active del técnico |
| Auto-avance de estado | `assign_order` trigger | ✅ OK | Si status='pendiente' → avanza a 'asignado' |
| Log en bitácora | `work_logs` | ✅ OK | Evento `order_assigned` con assigned_name |
| Notificación al técnico | `trg_order_notifications` | ✅ OK | Migration 0107 |
| Invitar miembro si no existe | `InviteMemberMiniSheet` | ✅ OK | Embebido en AssignTechSheet |
| React Query invalidation | `handleAssigned()` | ✅ OK | Invalida `['order', id]` |

---

## 3. ESTADOS DEL PEDIDO

| Transición | Permitida | Validación backend |
|-----------|----------|--------------------|
| pendiente → asignado | ✅ | `update_order_status` RPC (0107) |
| pendiente → programado | ✅ | Idem |
| asignado → programado | ✅ | Idem |
| programado → en_ruta | ✅ | Idem |
| programado → en_ejecucion | ✅ | Idem (salto válido) |
| en_ruta → en_sitio | ✅ | Idem |
| en_sitio → en_ejecucion | ✅ | Idem |
| en_ejecucion → pausado | ✅ | Idem |
| en_ejecucion → finalizado | ✅ | Idem |
| pausado → en_ejecucion | ✅ | Idem |
| finalizado → facturado | ✅ | Idem |
| cualquiera → cancelado | ✅ | Permitido desde estados no terminales |
| facturado → cualquiera | ❌ | Bloqueado (estado final) |
| finalizado → pendiente | ❌ | Bloqueado |

---

## 4. ÓRDENES DE TRABAJO (OTs)

| Paso | Estado | Notas |
|------|--------|-------|
| Crear OT desde detalle pedido | ✅ OK | Botón dashed "Nueva Orden de Trabajo" |
| OT hereda workspace_id | ✅ OK | `create_work_order` RPC (0107) del JWT |
| OT hereda assigned_to del pedido | ✅ OK | `COALESCE(p_assigned_to, v_order.assigned_to)` en RPC 0107 |
| OT estado inicial | ✅ OK | 'asignada' si hay técnico, 'pendiente' si no |
| Log automático en bitácora | ✅ OK | `work_order_created` con inherited_assignment flag |
| Navegar a detalle OT | ✅ OK | → `/app/ordenes-trabajo/{id}` |

---

## 5. BITÁCORA

| Evento | Auto-generado | Manual |
|--------|--------------|--------|
| Pedido creado | ✅ (RPC create_order) | — |
| Estado cambiado | ✅ (update_order_status) | — |
| Técnico asignado | ✅ (assign_order) | — |
| OT creada | ✅ (create_work_order) | — |
| Comentario | — | ✅ (usuario) |
| Novedad | — | ✅ (usuario, prefijo [NOVEDAD]) |
| Evidencia subida | ✅ (trigger en evidence_files) | — |

---

## 6. EVIDENCIAS

| Feature | Estado | Notas |
|---------|--------|-------|
| Upload de foto/video/doc | ✅ OK | `EvidenceUploader` + Supabase Storage |
| Clasificación por fase | ✅ OK | Trigger `trg_evidence_phase` (0106) |
| Fase automática | ✅ OK | Antes/Durante/Después según status del pedido |
| Sub-tabs en UI | ✅ OK | Todas/Antes/Durante/Después/Fotos/Firmas |
| Galería | ✅ OK | `EvidenceGallery` |
| Feature gate storage | ✅ OK | `storage_enabled` (PREMIUM) |

---

## 7. BÚSQUEDA Y FILTROS

| Feature | Estado | Notas |
|---------|--------|-------|
| Búsqueda por título | ✅ OK | Client-side, debounce 300ms |
| Búsqueda por order_number | ✅ OK | Client-side |
| Búsqueda por cliente | ✅ OK | Client-side |
| Filtros por estado | ✅ OK | Server-side via `list_orders(p_status)` |
| Debounce | ✅ OK | `useRef` + `setTimeout` 300ms |

---

## 8. NOTIFICACIONES

| Trigger | Estado | Canal |
|---------|--------|-------|
| Pedido asignado a técnico | ✅ OK | Tabla `notifications` (trigger 0107) |
| Cambio de estado en_ruta/en_sitio | ✅ OK | Tabla `notifications` (trigger 0107) |
| Centro de notificaciones UI | ✅ OK | `NotificationBell` (existente) |
| Push (futuro) | 🔲 Pendiente | Estructura preparada |

---

## 9. SEGURIDAD

| Control | Estado |
|---------|--------|
| workspace_id siempre del JWT | ✅ Todos los RPCs usan `auth.uid()` → `profiles.workspace_id` |
| RLS en orders | ✅ Política `workspace_id = current_workspace_id()` |
| RLS en work_orders | ✅ Idem |
| RLS en work_logs | ✅ Idem |
| Roles validados en backend | ✅ Todos los RPCs validan `v_caller_role` |
| Feature flags validados en backend | ✅ `check_feature_access` en RPCs críticos |
| Técnico de otro workspace | ✅ Bloqueado por verificación en `assign_order` |
