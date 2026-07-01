# AUDIT_MISSING_CONNECTIONS.md
# Shelwi — Conexiones Faltantes y Desconectadas
Fecha: 2026-06-25

---

## CLASIFICACIÓN DE SEVERIDAD
🔴 CRÍTICO — Bloquea uso real | 🟠 ALTO — Feature anunciada sin implementar | 🟡 MEDIO — UX incompleta | 🟢 BAJO — Mejora deseada

---

## DESCONEXIONES CRÍTICAS 🔴

### 1. "Nuevo pedido" NO crea pedido

**Problema**: El botón "Nuevo pedido" en FAB, Dashboard y CotizacionesMobile navega a `/app/pedidos` (la lista), NO abre ningún formulario de creación.

**Causa raíz**: La RPC `create_order` requiere `p_quote_id` de una cotización **aprobada**. No existe RPC `create_direct_order` ni pantalla `PedidoNuevoPage`.

**Impacto**: Usuario que quiera crear un pedido de mantenimiento, instalación u otro servicio sin pasar por cotización queda completamente bloqueado.

**Archivos afectados**:
- `src/services/orders.ts` — `CreateOrderInput` requiere `quoteId`
- `supabase/migrations/0051_orders_rpc.sql` — `create_order` valida quote aprobada
- `src/components/ui/FAB.tsx` — `case 'order': navigate('/app/pedidos')` (no hace nada útil)
- `src/components/dashboard/MobileDashboard.tsx` — mismo problema

**Fix requerido**: Migración `create_direct_order(client_id, title, description, items[])` + vista `PedidoNuevoPage`.

---

### 2. "Hablar con IA" / "Crear con IA" = Sin flujo de creación por voz

**Problema**: Todos los botones de IA en FAB y Dashboard navegan a `/app/ia` (`KtzIA`/`ShelwiIAMobile`). Esta pantalla es un **copiloto comercial para analizar cotizaciones existentes**, NO para crear cotizaciones/pedidos por voz.

**Causa raíz**: No existe interfaz de voz para crear. No hay Web Speech API, ni STT, ni flujo "hablar → IA interpreta → genera cotización".

**Impacto**: El feature más prominente de la app (anunciado en FAB, Dashboard, CotizacionesMobile, Onboarding) **no existe realmente**.

**Archivos afectados**:
- `src/views/KtzIA.tsx` — solo análisis comercial
- `src/components/ia/ShelwiIAMobile.tsx` — dashboard IA, no creación
- No existe vista de voz para crear

**Fix requerido**: Nueva vista `IACrearPage` (`/app/ia/crear`) con micrófono, transcripción, y generación de cotización/pedido via `aiCommercial.ts`.

---

### 3. ConfiguracionPage Desktop = Pantalla vacía

**Problema**: En desktop, `/app/config` muestra `SimpleEmpty` con mensaje "Esta sección llega en la siguiente entrega".

**Causa raíz**: `ConfiguracionPage.tsx` detecta desktop y retorna `<SimpleEmpty variant="config" />`.

**Impacto**: Owner en desktop que va a Configuración ve una pantalla placeholder.

**Fix requerido**: Implementar `ConfiguracionDesktop` o redirigir a `/app/empresa` + `/app/config/integraciones`.

---

## DESCONEXIONES ALTAS 🟠

### 4. Páginas avanzadas sin acceso desde navegación

Las siguientes páginas existen y funcionan pero **ningún usuario las encuentra** a través de la navegación normal:

| Página | Ruta | Acceso actual |
|--------|------|---------------|
| Growth & Marketing | `/app/growth` | Solo URL directa |
| Business Intelligence | `/app/bi` | Solo URL directa |
| Dashboard Financiero | `/app/finanzas` | Solo URL directa |
| Customer Success | `/app/customer-success` | Solo URL directa |
| Automatizaciones | `/app/automatizaciones` | Solo URL directa |
| IA Operativa | `/app/ia/operaciones` | Solo URL directa |
| Webhooks | `/app/config/webhooks` | Solo URL directa |

**Fix requerido**: Agregar estas páginas al sidebar desktop y/o al sheet "Más" del mobile nav.

---

### 5. "Desde foto" sin funcionalidad de foto real

**Problema**: Botones "Desde foto", "Desde imagen" navegan a `/app/ia` pero no activan la cámara ni interpretan imágenes.

**Causa raíz**: `KtzIA` tiene la funcionalidad `photo_quote` pero solo en el desktop (con input de imagen). El mobile no tiene flujo de cámara activada.

**Fix requerido**: Conectar `Desde foto` al flujo existente de `photo_quote` en `KtzIADesktop` o crear versión mobile.

---

### 6. IntegracionesPage con "Próximamente"

**Problema**: 3 integraciones muestran "Próximamente" en la pantalla de integraciones:
- WhatsApp Business API
- Payroll/Nómina (si aplica)
- Otras mencionadas como próximas

**Fix**: Quitar si no van a implementarse pronto, o agregar formulario de notificación "avisarme cuando esté disponible".

---

## DESCONEXIONES MEDIAS 🟡

### 7. Team page — botón "Próximamente"

`src/views/Team.tsx:301` tiene `onClick={() => showToast('Próximamente')}` en alguna acción.

### 8. `/app/proyectos` = SimpleEmpty

La ruta `/app/proyectos` existe pero muestra placeholder. No aparece en nav principal — bajo riesgo.

### 9. Materiales sin acceso mobile

`/app/materiales` existe y funciona pero no está en la navegación mobile.

### 10. Pipeline sin acceso mobile

`/app/pipeline` existe y funciona pero no está en la navegación mobile.

### 11. BillingResult.tsx huérfano

`src/views/billing/BillingResult.tsx` existe pero no está importado en el router.

---

## COMPONENTES HUÉRFANOS (existen, no usados en nav)

| Componente/Vista | Ruta/Archivo | Estado |
|-----------------|-------------|--------|
| BillingResult.tsx | billing/BillingResult.tsx | No en router |
| IAOperacionesPage | /app/ia/operaciones | Sin nav access |
| GrowthPage | /app/growth | Sin nav access |
| BIPage | /app/bi | Sin nav access |
| FinancePage | /app/finanzas | Sin nav access |
| CustomerSuccessPage | /app/customer-success | Sin nav access |
| AutomatizacionesPage | /app/automatizaciones | Sin nav access |
| WebhooksPage | /app/config/webhooks | Sin nav access |
| MapaOperativoPage alias | /app/operaciones/mapa | Alias sin uso real |

---

## HOOKS/RPCS IMPLEMENTADOS SIN UI

| Hook/Servicio | Archivo | UI conectada |
|--------------|---------|-------------|
| `useAdminFinanceSummary` | hooks/useFinance.ts | Solo IAAdminTab |
| `useClientCohorts` | hooks/useBI.ts | Solo BIPage (sin nav) |
| `useWebhookDeliveries` | hooks/useWebhooks.ts | Solo WebhooksPage (sin nav) |
| `get_sales_by_rep` | RPCs BI | Solo BIPage (sin nav) |
| `get_ops_productivity` | RPCs BI | Solo BIPage + IAOperaciones (sin nav) |
| `adjust_loyalty_points` | CX CMS | Solo AdminPanel |
| `upsert_survey` | CX CMS | Solo AdminPanel |
