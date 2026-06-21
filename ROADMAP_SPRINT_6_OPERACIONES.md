# ROADMAP — SPRINT 6: OPERACIONES

**Objetivo:** Convertir cotizaciones aprobadas en trabajo ejecutable mediante Pedidos y Órdenes de Trabajo.

---

## ESTADO ACTUAL

### BACKEND
- [x] 0050: Tablas `orders` + `work_orders` + `work_logs` + contadores + RLS + índices
- [x] 0051: RPCs Zero Trust con feature gating PREMIUM
  - [x] `create_order` (con snapshot R4)
  - [x] `list_orders`
  - [x] `get_order`
  - [x] `update_order_status`
  - [x] `create_work_order`
  - [x] `list_work_orders`
  - [x] `update_work_order_status`
  - [x] `assign_work_order`
  - [x] `add_work_log_comment`
  - [x] `get_operations_dashboard`
- [x] 0052: Triggers bitácora automática + notificaciones + R5 protección cotización
- [x] Deploys SQL a producción

### DECISIONES ARQUITECTÓNICAS
- [x] R2: `assigned_to` almacena UUID (user_id), compatible con todos los roles
- [x] R3: Pipeline Desktop implementado con Kanban horizontal real
- [x] R4: `order_snapshot` congela la cotización en el momento de crear el pedido
- [x] R5: Trigger `prevent_quote_soft_delete_with_order` bloquea eliminación con pedidos activos

### FRONTEND
- [x] `src/lib/database.types.ts`: OrderRow, WorkOrderRow, WorkLogRow, enums
- [x] `src/services/orders.ts`: createOrder, listOrders, getOrder, updateOrderStatus, getOperationsDashboard
- [x] `src/services/workOrders.ts`: createWorkOrder, listWorkOrders, updateWorkOrderStatus, assignWorkOrder
- [x] `src/hooks/useOrders.ts`: useOrders, useOrderDetail, useCreateOrder, useUpdateOrderStatus, useOperationsDashboard
- [x] `src/hooks/useWorkOrders.ts`: useWorkOrders, useCreateWorkOrder, useUpdateWorkOrderStatus, useAssignWorkOrder
- [x] `src/views/Pedidos.tsx`: Listado mobile-first con filtros y búsqueda
- [x] `src/views/PedidoDetailPage.tsx`: Detalle con OTs, bitácora, snapshot R4, cambio de estado
- [x] `src/views/OrdenesDeTrabajo.tsx`: Listado mobile-first con filtros de estado y prioridad
- [x] `src/views/OTDetailPage.tsx`: Detalle con cambio de estado y comentarios
- [x] `src/views/Pipeline.tsx`: Desktop Kanban real (R3 fix)
- [x] `src/views/QuoteDetailPage.tsx`: Botón "Crear Pedido" cuando status=Aprobada + feature gate
- [x] `src/router.tsx`: Rutas `/app/pedidos`, `/app/pedidos/:id`, `/app/ordenes-trabajo`, `/app/ordenes-trabajo/:id`
- [x] `src/lib/icons.tsx`: NavIds `pedidos` y `ordenesDeTrabajo` + iconos SVG
- [x] `src/components/layout/Sidebar.tsx`: Items de navegación + ruta activa correcta
- [x] `src/components/layout/MobileBottomNav.tsx`: Pedidos y OT en MORE_ITEMS

---

## PENDIENTE (Sprints futuros)

### Sprint 7 — GPS y Evidencias
- [ ] Tabla `work_order_locations` (GPS checkpoints)
- [ ] Tabla `work_order_evidence` (fotos/adjuntos)
- [ ] Edge function `geo-checkin`
- [ ] RPC `track_work_order_gps`
- [ ] Vista mapa con posición de OT

### Sprint 8 — Equipo y Asignación
- [ ] Roles: supervisor, operario, comercial
- [ ] Vista de asignación masiva
- [ ] Notificaciones push al asignado

---

## FEATURE GATING
| Feature | FREE | PRO | PREMIUM |
|---------|------|-----|---------|
| `orders_enabled` | ❌ | ❌ | ✅ |
| `work_orders_enabled` | ❌ | ❌ | ✅ |

---

## PRUEBAS

### TEST 1 — FREE bloqueado
- [ ] Workspace FREE → /app/pedidos → upgrade modal

### TEST 2 — PRO bloqueado
- [ ] Workspace PRO → /app/pedidos → upgrade modal

### TEST 3 — PREMIUM crea pedido
- [ ] PREMIUM + cotización Aprobada → botón "Crear Pedido" → pedido creado con snapshot

### TEST 4 — Snapshot intacto
- [ ] Editar cotización después de crear pedido → snapshot en pedido sin cambios

### TEST 5 — R5 protección
- [ ] Intentar soft-delete cotización con pedido activo → bloqueado con P0001

### TEST 6 — OT + bitácora
- [ ] Crear OT → cambiar estado → bitácora registra evento automáticamente

### TEST 7 — Cross-workspace bloqueado
- [ ] RPC con order_id de otro workspace → error "Pedido no encontrado"
