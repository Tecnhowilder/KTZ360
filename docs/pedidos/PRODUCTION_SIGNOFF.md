# PEDIDOS — PRODUCTION SIGNOFF

**Fecha:** 2026-06-26  
**Validado por:** Auditoría de código estática exhaustiva

---

## DECLARACIÓN HONESTA DE MÉTODO

Esta validación fue realizada mediante:
- Lectura completa de todos los archivos relevantes del módulo Pedidos
- Trazado de cada ruta de ejecución (frontend → hook → service → RPC → DB)
- Verificación de que las firmas de funciones entre frontend y backend coincidan
- Compilación TypeScript (0 errores)

**Lo que NO fue hecho:** Click-through en navegador, pruebas HTTP reales, login de usuario real. Eso requiere un entorno con Supabase corriendo, migraciones aplicadas y un dispositivo.

**Implicación:** Los resultados PASS en este documento significan "código correcto verificado". No significan "probado en producción".

---

## ESTADO ACTUAL DEL MÓDULO

### Código (frontend + backend SQL)

| Componente | Estado |
|-----------|--------|
| `PedidoNuevoPage` — Crear pedido directo | ✅ LISTO |
| `PedidoDetailPage` — Detalle completo | ✅ LISTO |
| `AssignTechSheet` — Asignar técnico | ✅ LISTO |
| `InviteMemberMiniSheet` — Invitar sin salir | ✅ LISTO |
| `OrderTimeline` — Línea de tiempo | ✅ LISTO |
| `LogEntry` — Bitácora con novedades | ✅ LISTO |
| Estados extendidos (9 + cancelado) | ✅ LISTO |
| Detección pedido directo vs cotización | ✅ LISTO |
| Herencia de técnico en OTs | ✅ LISTO |
| RPC `assign_order` | ✅ LISTO (migration 0107) |
| RPC `create_work_order` extendido | ✅ LISTO (migration 0107) |
| RPC `update_order_status` extendido | ✅ LISTO (migration 0107) |
| RPC `get_assignable_members` | ✅ LISTO (migration 0107) |
| Trigger notificaciones | ✅ LISTO (migration 0107) |
| Constraint bulletproof orders.status | ✅ LISTO (migration 0107) |
| Columna `orders.source` | ✅ LISTO (migration 0107) |
| Clasificación evidencias por fase | ✅ LISTO (migration 0106) |
| TypeScript errors | ✅ 0 errores |
| Build | ✅ Limpio 1.94s |

### Infraestructura (pendiente del operador)

| Elemento | Estado | Prioridad |
|---------|--------|----------|
| Migration 0105 aplicada en Supabase | ⏳ PENDIENTE | 🔴 CRÍTICA |
| Migration 0106 aplicada en Supabase | ⏳ PENDIENTE | 🔴 CRÍTICA |
| Migration 0107 aplicada en Supabase | ⏳ PENDIENTE | 🔴 CRÍTICA |
| Resend API key en system_configuration | ⏳ PENDIENTE | 🟡 ALTA |
| Feature flags PREMIUM habilitados | ⏳ PENDIENTE | 🟡 ALTA |
| Imágenes onboarding por rol | ⏳ PENDIENTE | 🟢 BAJA |

---

## CRITERIO DE PRODUCCIÓN

El módulo Pedidos estará listo para producción cuando:

1. ☐ Migration 0105 aplicada y verificada con `SELECT * FROM pg_proc WHERE proname = 'create_direct_order'`
2. ☐ Migration 0106 aplicada y verificada con `SELECT * FROM pg_proc WHERE proname = 'assign_order'`
3. ☐ Migration 0107 aplicada y verificada con `SELECT conname FROM pg_constraint WHERE conrelid='orders'::regclass AND contype='c'` → solo 2 constraints: `orders_status_check` + `orders_source_check`
4. ☐ Prueba manual Caso 1: Crear pedido directo sin errores HTTP
5. ☐ Prueba manual Caso 2: Asignar técnico → HTTP 200, log en bitácora
6. ☐ Prueba manual Caso 10: `finalizado → facturado` sin errores

Los 10 casos del TEST_CASES.md deben probarse en el entorno real por el equipo una vez aplicadas las migraciones.

---

## REGLA PARA FUTUROS SPRINTS

**Ningún sprint se considera terminado porque compile o porque las migraciones existan.**

Un sprint está terminado cuando:
1. ✅ Build limpio (0 errores TypeScript)
2. ✅ Migraciones aplicadas y verificadas en Supabase
3. ✅ Casos de prueba documentados en `TEST_CASES.md`
4. ✅ Prueba click-through de los escenarios críticos realizada por el equipo
5. ✅ 0 HTTP 400/500 en consola durante el flujo completo
6. ✅ `TEST_RESULTS.md` con resultados reales marcados PASS

---

## FIRMA

**Código:** ✅ Auditado y correcto  
**Bugs:** 7 encontrados, 7 corregidos  
**Bloqueos de infraestructura:** 4 documentados, ninguno es un bug de código  
**TypeScript:** ✅ 0 errores  
**Build:** ✅ `✓ built in 1.94s`

**El módulo Pedidos NO se firma como terminado hasta que el equipo complete la validación manual con las migraciones aplicadas y documente los resultados reales en TEST_RESULTS.md.**

---

*Próxima acción requerida: Aplicar migrations 0105, 0106, 0107 en Supabase SQL Editor y ejecutar los 10 casos de prueba manualmente.*
