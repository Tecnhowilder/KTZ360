# IMPLEMENTATION_PLAN.md
# Shelwi — Plan de Implementación Post-Auditoría
Fecha: 2026-06-25

---

## PRIORIZACIÓN

| # | Item | Severidad | Esfuerzo | Reutiliza |
|---|------|-----------|---------|-----------|
| 1 | IA Crear por voz | 🔴 CRÍTICO | M | callAistudio, openQuoteFlow |
| 2 | Pedido directo sin cotización | 🔴 CRÍTICO | M | create_order refactor, catalog |
| 3 | Navegación a páginas huérfanas | 🟠 ALTO | S | Todos los componentes existentes |
| 4 | ConfiguracionPage Desktop | 🟠 ALTO | S | ConfiguracionMobile + redireccionamiento |
| 5 | Desde foto (mobile) | 🟠 ALTO | S | photo_quote existente |
| 6 | "Nuevo pedido" FAB → formulario | 🔴 CRÍTICO | S | Depende de #2 |
| 7 | Integraciones "Próximamente" | 🟡 MEDIO | XS | Quitar/limpiar |
| 8 | Team.tsx "Próximamente" | 🟡 MEDIO | XS | Quitar toast |
| 9 | BillingResult.tsx orphan | 🟢 BAJO | XS | Eliminar o agregar a router |

---

## BLOQUE 1 — CRÍTICO: IA CREAR POR VOZ

### Implementar: `IACrearPage` (`/app/ia/crear`)

**Archivos a crear:**
- `src/views/IACrearPage.tsx`

**Archivos a modificar:**
- `src/router.tsx` — añadir ruta `/app/ia/crear`
- `src/components/ui/FAB.tsx` — cambiar `case 'ia'` de `/app/ia` a `/app/ia/crear`
- `src/components/dashboard/MobileDashboard.tsx` — misma acción
- `src/components/cotizaciones/CotizacionesMobile.tsx` — tab Crear → Hablar con IA

**NO crear:**
- Nuevo motor IA (usar `callAistudio()`)
- Nuevo flujo de cotización (usar `openQuoteFlow()`)
- Nuevo sistema STT (usar Web Speech API nativo)

**Flujo exacto:**
1. Pantalla limpia: opción "Cotización" o "Pedido"
2. Botón micrófono grande → graba con Web Speech API
3. Transcript → `callAistudio()` con prompt de extracción de catálogo
4. Vista previa del resultado
5. Confirmar → `openQuoteFlow()` con datos pre-cargados

---

## BLOQUE 2 — CRÍTICO: PEDIDO DIRECTO SIN COTIZACIÓN

### Migración SQL: `create_direct_order`

**Nuevo RPC:** `create_direct_order(p_client_id, p_title, p_items, p_total, p_notes)`
- Feature gated: orders_enabled (PREMIUM)
- Zero Trust: workspace_id del JWT
- Sin validación de cotización aprobada
- Crea pedido con snapshot mínimo (items pasados directamente)

**Archivos a crear:**
- `supabase/migrations/0105_direct_order.sql`
- `src/views/PedidoNuevoPage.tsx` (ruta `/app/pedidos/nuevo`)

**Archivos a modificar:**
- `src/router.tsx` — añadir `/app/pedidos/nuevo`
- `src/services/orders.ts` — añadir `createDirectOrder()`
- `src/components/ui/FAB.tsx` — `case 'order': navigate('/app/pedidos/nuevo')`
- `src/components/dashboard/MobileDashboard.tsx` — misma acción
- `src/views/Pedidos.tsx` — botón "Nuevo pedido" → `/app/pedidos/nuevo`

**UI de PedidoNuevoPage:**
- Seleccionar cliente (reutiliza `StepClient` existente)
- Agregar título y descripción
- Opcional: agregar líneas del catálogo
- Crear pedido → ir al detalle

---

## BLOQUE 3 — ALTO: NAVEGACIÓN A PÁGINAS HUÉRFANAS

### Modificar sidebar desktop (`Sidebar.tsx` + `NAV_ICONS` + `NAV_ITEMS`)

Agregar al sidebar:
- Customer Success (`/app/customer-success`)
- Automatizaciones (`/app/automatizaciones`)
- Growth (bajo "Marketing")
- BI / Business Intelligence
- Finanzas

### Modificar Bottom Nav Mobile (sheet "Más")

Agregar grupos/items:
- Customer Success
- Automatizaciones
- Growth & Marketing
- Finanzas & BI

**Archivos a modificar:**
- `src/lib/icons.tsx` — añadir NAV_ICONS para páginas nuevas
- `src/components/layout/Sidebar.tsx` — añadir items
- `src/components/layout/MobileBottomNav.tsx` — añadir a grupos del sheet Más
- `src/components/layout/MobileDrawer.tsx` — añadir a nav

---

## BLOQUE 4 — ALTO: CONFIGURACION DESKTOP

**Archivos a modificar:**
- `src/views/ConfiguracionPage.tsx` — eliminar `SimpleEmpty`, mostrar grid de accesos:
  - Mi Empresa → `/app/empresa`
  - Integraciones → `/app/config/integraciones`
  - Almacenamiento → `/app/config/almacenamiento`
  - Webhooks → `/app/config/webhooks`
  - Planes → `/app/planes`

---

## BLOQUE 5 — ALTO: DESDE FOTO MOBILE

**Archivos a modificar:**
- `src/components/cotizaciones/CotizacionesMobile.tsx` — "Desde foto" → abrir input de imagen y pasar a `/app/ia/crear?mode=photo`
- `src/views/IACrearPage.tsx` — modo foto (leer query param)

---

## BLOQUE 6 — LIMPIEZA RÁPIDA

**Team.tsx:** Quitar `showToast('Próximamente')`, implementar acción real o remover botón.

**IntegracionesPage:** Quitar texto "Próximamente" de integraciones que sí existen, limpiar las que realmente no están implementadas.

**BillingResult.tsx:** Agregar al router o eliminar archivo.

---

## ORDEN DE EJECUCIÓN RECOMENDADO

```
SPRINT CONEXIONES (estimado 1-2 días)
├── 1. create_direct_order migración + RPC
├── 2. PedidoNuevoPage básico
├── 3. FAB + Dashboard → /app/pedidos/nuevo
├── 4. Navegación páginas huérfanas (sidebar + mobile)
├── 5. ConfiguracionPage Desktop
└── 6. Limpieza rápida (toast, próximamente, huérfanos)

SPRINT IA CREAR (estimado 2-3 días)
├── 1. IACrearPage con Web Speech API
├── 2. Prompt de interpretación para catálogo
├── 3. Conectar resultado → openQuoteFlow()
├── 4. Modo pedido directo desde voz
├── 5. Modo foto (camera → IACrearPage)
└── 6. Router + FAB + Dashboard conectados

VALIDACIÓN FINAL
├── Test flujo cotización completo E2E
├── Test flujo pedido directo
├── Test IA voz → cotización
├── Test navegación todos los roles
└── Build TypeScript 0 errores
```

---

## ESTIMADO DE ARCHIVOS A MODIFICAR

| Archivo | Cambio |
|---------|--------|
| `src/router.tsx` | +2 rutas nuevas |
| `src/lib/icons.tsx` | +7 iconos nav |
| `src/components/ui/FAB.tsx` | Cambiar 2 actions |
| `src/components/layout/MobileBottomNav.tsx` | +5 items en grupos |
| `src/components/layout/MobileDrawer.tsx` | +5 nav items |
| `src/components/layout/Sidebar.tsx` | +5 nav items |
| `src/components/dashboard/MobileDashboard.tsx` | 2 actions |
| `src/views/ConfiguracionPage.tsx` | Reemplazar SimpleEmpty |
| `src/services/orders.ts` | +1 función |
| `src/components/cotizaciones/CotizacionesMobile.tsx` | 2 acciones |
| `supabase/migrations/0105_direct_order.sql` | Nuevo |

| Archivo nuevo | Descripción |
|--------------|-------------|
| `src/views/IACrearPage.tsx` | Flujo IA voz/foto |
| `src/views/PedidoNuevoPage.tsx` | Nuevo pedido directo |
