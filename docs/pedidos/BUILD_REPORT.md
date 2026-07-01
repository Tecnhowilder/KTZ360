# BUILD REPORT — Pedidos Production Ready

**Fecha:** 2026-06-26  
**Commit scope:** Sprint Estabilización Pedidos

---

## RESULTADO DEL BUILD

```
✓ built in 2.39s
0 TypeScript errors
0 ESLint blocking errors
```

---

## ARCHIVOS MODIFICADOS EN ESTE SPRINT

### Nuevas migraciones
| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/0106_orders_extended_flow.sql` | Estados extendidos, assign_order RPC, evidence phase |
| `supabase/migrations/0107_pedidos_production_ready.sql` | Fix bulletproof constraint, source column, OT inheritance, notifications |

### Frontend
| Archivo | Cambios |
|---------|---------|
| `src/views/PedidoDetailPage.tsx` | Reescritura completa: timeline, técnico, novedades, evidencias por fase, invite sheet, source detection |
| `src/views/Pedidos.tsx` | Dos botones acción + búsqueda debounced + filtrado local + error handling |
| `src/views/PedidoNuevoPage.tsx` | Creación de cliente en contexto (ClientQuickCreateSheet) |
| `src/services/workOrders.ts` | Nuevos status labels/colors (asignado, en_ruta, en_sitio, facturado) |
| `src/lib/roleOnboarding.ts` | Contenido de slides actualizado según rol (imágenes pendientes) |
| `src/components/clients/ClientQuickCreateSheet.tsx` | Nuevo — bottom sheet reutilizable para creación en contexto |
| `src/components/clientes/ClientesMobile.tsx` | Estado vacío + botón "Nuevo" + acciones rápidas wired |
| `src/components/layout/MobileBottomNav.tsx` | Navegación adaptativa por rol |
| `src/components/team/TeamMobile.tsx` | Rediseño completo con KPI sheets, LimitReachedModal, invite flow |

---

## CHECKLIST DE CRITERIOS DE ACEPTACIÓN

| Criterio | Estado |
|---------|--------|
| ✓ TypeScript 0 errores | ✅ |
| ✓ Build limpio | ✅ |
| ✓ assign_order RPC: fix bulletproof del constraint | ✅ (en migration 0107) |
| ✓ OT hereda assigned_to del pedido padre | ✅ (frontend + RPC) |
| ✓ Pedido directo no muestra "Cotización congelada" | ✅ |
| ✓ Técnico asignado visible en header del pedido | ✅ |
| ✓ Asignar técnico sin salir del pedido | ✅ |
| ✓ Invitar miembro sin salir del pedido | ✅ |
| ✓ Link a mapa GPS del técnico | ✅ |
| ✓ Estados extendidos: 9 estados + cancelado | ✅ |
| ✓ Bitácora automática en todos los eventos | ✅ |
| ✓ Novedades integradas a la línea de tiempo | ✅ |
| ✓ Evidencias clasificadas por fase | ✅ |
| ✓ Línea de tiempo visual | ✅ |
| ✓ Zero Trust intacto | ✅ |
| ✓ Multi-Tenant intacto | ✅ |
| ✓ RLS intacto | ✅ |
| ✓ React Query sin duplicación de queries | ✅ |

---

## ACCIONES PENDIENTES (NO BLOQUEANTES PARA BUILD)

| Acción | Prioridad |
|--------|----------|
| Aplicar migration 0106 en Supabase SQL Editor | 🔴 CRÍTICA |
| Aplicar migration 0107 en Supabase SQL Editor | 🔴 CRÍTICA |
| Configurar Resend API key en system_configuration | 🟡 ALTA |
| Agregar imágenes de onboarding por rol en `/images/onboarding/` | 🟢 MEDIA |
| Configurar Push Notifications (estructura ya preparada) | 🟢 BAJA |

---

## RPCs QUE REQUIEREN APLICAR LAS MIGRACIONES

| RPC | Migration | Estado en DB |
|-----|-----------|-------------|
| `assign_order` | 0106 + 0107 | ⚠️ Pendiente aplicar |
| `update_order_status` (extendido) | 0106 + 0107 | ⚠️ Pendiente aplicar |
| `get_order` (con assigned_name) | 0106 | ⚠️ Pendiente aplicar |
| `create_work_order` (con herencia) | 0107 | ⚠️ Pendiente aplicar |
| `get_assignable_members` | 0107 | ⚠️ Pendiente aplicar |

---

## CÓMO APLICAR LAS MIGRACIONES

1. Ir al **Supabase Dashboard** → SQL Editor
2. Ejecutar el contenido de `supabase/migrations/0106_orders_extended_flow.sql`
3. Ejecutar el contenido de `supabase/migrations/0107_pedidos_production_ready.sql`
4. Verificar con: `SELECT ok FROM update_order_status('00000000-0000-0000-0000-000000000000'::uuid, 'pendiente');`
   Esperado: `{"ok": false, "error": "Pedido no encontrado"}` — confirma que la función existe y ejecuta.
