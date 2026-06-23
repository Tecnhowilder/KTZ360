# FINANCE_HOTFIX_AUDIT.md
# Shelwi — Auditoría Hotfix Financiero
Fecha: 2026-06-22 | Clasificación: CRÍTICO

---

## 1. INVENTARIO COMPLETO

### 1.1 Procesadores de pago

| Sistema | Estado | Evidencia |
|---------|--------|-----------|
| **MercadoPago** | ✅ EXISTE y FUNCIONAL | `create-checkout` + `mp-webhook` completamente implementados. Flujo: checkout → webhook → validación directa en MP API → activación suscripción |
| **Wompi** | ❌ DECLARADO, NO IMPLEMENTADO | Solo existe como valor en check constraint de `subscriptions.provider`. Ningún checkout, webhook, ni lógica. Deuda técnica desde Sprint 1. |
| **Stripe** | ❌ DECLARADO, NO IMPLEMENTADO | Igual que Wompi. Solo en el check constraint. |
| **Manual** | ✅ EXISTE | `provider='manual'` en subscriptions para workspaces asignados por admin |

**Conclusión:** El único procesador de pago real y activo es **MercadoPago**. Wompi y Stripe son placeholders sin implementación.

---

### 1.2 Tablas financieras — Estado completo

| Tabla | Estado | Descripción |
|-------|--------|-------------|
| `plans` | ✅ EXISTE | Planes con precios. Usado por `create-checkout` y `mp-webhook`. |
| `plan_limits` | ✅ EXISTE | Límites por plan (clientes, cotizaciones, etc.) |
| `plan_features` | ✅ EXISTE | Feature flags por plan |
| `subscriptions` | ✅ EXISTE | Estado actual de suscripción por workspace. Actualizado por mp-webhook. |
| `payment_events` | ✅ EXISTE | Registro idempotente de cada pago MP. UNIQUE(payment_id, status). |
| `integration_invoices` | ✅ EXISTE | Espejo local de facturas Alegra (cliente → su cliente). **NUNCA para facturas SaaS de Shelwi.** |
| `integration_credentials` | ✅ EXISTE | Credenciales Alegra cifradas AES-256-GCM. |
| `integration_entity_refs` | ✅ EXISTE | Mapeo entity_id → external_id por proveedor (alegra_contact_id, invoice_id, etc.) |
| `integration_events` | ✅ EXISTE | Cola asíncrona de eventos a procesar (invoice_create, email_send, etc.) |
| `integrations` | ✅ EXISTE | Estado de conexión por workspace+provider. Tiene `config->>'auto_invoice'`. |
| `order_cost_entries` | ✅ EXISTE | Sprint 18 — costos reales por pedido |
| `saas_invoices` | ❌ FALTA | Tabla para facturas que Shelwi emite como empresa SaaS. NO EXISTE. |
| `payment_receipts` | ❌ FALTA | Comprobantes de pago enviados a clientes SaaS. NO EXISTE. |

---

### 1.3 Edge Functions financieras — Estado

| Edge Function | Estado | Descripción |
|---------------|--------|-------------|
| `create-checkout` | ✅ FUNCIONAL | Crea preferencia en MP. Zero Trust correcto. |
| `mp-webhook` | ✅ FUNCIONAL | Valida pago en MP API, activa suscripción. Idempotente. |
| `connect-integration` (Alegra) | ✅ FUNCIONAL | Valida credenciales Alegra API, guarda cifradas. |
| `integration-worker` (invoice_create) | ✅ FUNCIONAL | Crea factura en Alegra API. Guarda en integration_invoices. |
| `send-email` | ✅ FUNCIONAL | Envía emails via Resend. Templates: payment_approved, welcome, etc. **Nunca llamado desde mp-webhook.** |
| `alegra-webhook` | ❌ NO EXISTE | No hay Edge Function que reciba webhooks DE Alegra. |

---

### 1.4 RPCs financieras — Estado

| RPC | Estado | Descripción |
|-----|--------|-------------|
| `queue_invoice_generation(order_id)` | ✅ EXISTE | Encola invoice_create para un pedido. Zero Trust. |
| `get_invoice_history(workspace_id)` | ✅ EXISTE | Lee integration_invoices. Zero Trust. |
| `get_finance_dashboard(workspace_id)` | ⚡ BUG | Sprint 18. Referencia `integration_status` → debe ser `integrations`. |
| `get_admin_finance_summary()` | ✅ EXISTE | MRR/ARR estimados. Solo super_admin. |
| `get_workspace_profitability()` | ✅ EXISTE | Sprint 18. Rentabilidad desde calc_snapshot. |
| `void_invoice(order_id)` | ❌ FALTA | No existe. No se puede anular una factura desde Shelwi. |
| `sync_invoice_status(invoice_id)` | ❌ FALTA | No existe. No se puede consultar estado actual en Alegra. |
| `get_saas_invoice_history()` | ❌ FALTA | No existe. Shelwi no tiene historial de sus propias facturas. |

---

### 1.5 Integración Alegra — Ciclo de vida completo

| Operación | Estado | Implementación actual |
|-----------|--------|----------------------|
| Autenticación/conexión | ✅ EXISTE | `connect-integration` → API Basic Auth (email:token_base64) |
| Crear contacto en Alegra | ✅ EXISTE | `processAlegraInvoice()` — busca ref existente, si no, crea vía POST /contacts |
| Crear factura | ✅ EXISTE | `processAlegraInvoice()` → POST /invoices con 1 ítem genérico |
| Guardar referencia factura | ✅ EXISTE | `integration_invoices` + `integration_entity_refs` |
| Historial de facturas | ✅ EXISTE | `get_invoice_history()` RPC |
| Auto-factura al finalizar pedido | ✅ EXISTE | `trg_order_auto_invoice` trigger + `auto_invoice` config flag |
| **Ítems desglosados** | ❌ FALTA | Factura se crea con 1 ítem: {name: order.title, price: total_amount} |
| **URL del PDF** | ⚡ PARCIAL | `invoice.url` se guarda en `integration_entity_refs.external_url` pero NO en `integration_invoices.metadata` ni en ningún campo directo |
| **URL del XML** | ❌ FALTA | No se guarda ni procesa |
| **Consultar estado en Alegra** | ❌ FALTA | Sin GET /invoices/:id implementado |
| **Actualizar estado (pagada/vencida)** | ❌ FALTA | `integration_invoices.invoice_status` nunca se actualiza después de 'issued' |
| **Anular factura** | ❌ FALTA | Sin DELETE /invoices/:id ni ningún endpoint de anulación |
| **Nota crédito** | ❌ FALTA | No implementado |
| **Webhook de Alegra → Shelwi** | ❌ FALTA | No existe Edge Function ni endpoint para recibir notificaciones de Alegra |
| **Email con PDF al cliente** | ⚡ PARCIAL | Alegra puede enviar email propio si el workspace lo configura. Shelwi no controla esto. |
| **Reenvío de factura** | ❌ FALTA | No implementado desde Shelwi |

---

### 1.6 Facturación SaaS de Shelwi — Estado

| Elemento | Estado |
|----------|--------|
| Cobro de planes (MP) | ✅ FUNCIONAL |
| Activación de suscripción | ✅ FUNCIONAL |
| Email de confirmación de pago | ❌ **FALTA** — `payment_approved` template existe pero mp-webhook NUNCA lo llama |
| Factura electrónica propia | ❌ **FALTA TOTAL** — ningún mecanismo |
| Tabla `saas_invoices` | ❌ **NO EXISTE** |
| Conciliación pago ↔ factura | ❌ **FALTA TOTAL** |

---

### 1.7 Conciliación financiera — Estado

| Par | Estado |
|-----|--------|
| MP payment → `payment_events` | ✅ Automático vía webhook |
| MP payment → `subscriptions` | ✅ Automático vía webhook |
| MP payment → Email cliente | ❌ FALTA |
| MP payment → Factura Shelwi | ❌ FALTA TOTAL |
| Alegra invoice → `integration_invoices` status | ❌ NUNCA actualizado después de creación |
| `integration_invoices` → `orders` | ✅ order_id FK |
| `payment_events` ↔ `integration_invoices` | ❌ SIN RELACIÓN |

---

### 1.8 Seguridad — Estado actual

| Control | Estado | Detalle |
|---------|--------|---------|
| RLS en `integration_invoices` | ✅ CORRECTO | Política por workspace_id |
| RLS en `integration_credentials` | ✅ CORRECTO | Solo el workspace propietario |
| RLS en `integration_entity_refs` | ✅ CORRECTO | Solo el workspace propietario |
| RLS en `payment_events` | ✅ CORRECTO | Solo `is_support_admin()` puede leer todos |
| AES-256-GCM en credenciales Alegra | ✅ CORRECTO | store_alegra_credentials cifrla en Edge Function |
| Zero Trust en mp-webhook | ✅ CORRECTO | Workspace del external_reference, validado en MP API |
| Zero Trust en queue_invoice_generation | ✅ CORRECTO | workspace_id del JWT |
| Zero Trust en get_invoice_history | ✅ CORRECTO | workspace_id del JWT |
| Aislamiento Workspace A vs B en facturas | ✅ CORRECTO | Todas las políticas incluyen workspace_id |

---

## 2. BUGS CONFIRMADOS

### BUG-001 — CRÍTICO (migration 0085)
**Archivo:** `supabase/migrations/0085_finance_dashboard_rpc.sql`
**Líneas:** 212–213
**Código incorrecto:**
```sql
SELECT 1 FROM public.integration_status
WHERE workspace_id = p_workspace_id AND provider = 'alegra' AND status = 'connected'
```
**Tabla real:** `public.integrations` (NO existe `integration_status`)
**Efecto:** `get_finance_dashboard()` siempre devuelve `alegra.connected = false`
**Fix:** Migration 0086 — `CREATE OR REPLACE FUNCTION get_finance_dashboard(...)` con corrección

---

## 3. QUÉ PUEDO IMPLEMENTAR SIN INFORMACIÓN EXTERNA

| Item | Viable ahora |
|------|-------------|
| Fix BUG-001 (`integrations` en lugar de `integration_status`) | ✅ SÍ |
| Email de confirmación de pago (template ya existe, solo falta llamada desde mp-webhook) | ✅ SÍ |
| `sync_invoice_status()` RPC — consulta GET /invoices/:id en Alegra | ✅ SÍ |
| Edge Function `alegra-webhook` — receptor de notificaciones de Alegra | ✅ SÍ |
| `void_invoice()` RPC — anula factura en Alegra vía DELETE /invoices/:id | ✅ SÍ |
| Añadir `pdf_url` y `xml_url` a `integration_invoices` | ✅ SÍ |
| Ítems desglosados en factura (desde calc_snapshot.lines) | ✅ SÍ |
| `saas_invoices` tabla para facturas que Shelwi emite | ✅ SÍ (estructura, sin Alegra propio) |
| Conciliación `payment_events ↔ saas_invoices` | ✅ SÍ (estructura) |

| Item | REQUIERE INFORMACIÓN EXTERNA |
|------|------------------------------|
| Crear facturas electrónicas reales que Shelwi emite como empresa | ❌ Requiere cuenta Alegra de Shelwi, NIT, resolución DIAN |
| Factura electrónica con validación DIAN | ❌ Requiere ambiente producción/sandbox + resolución |
| PDF de factura electrónica de Shelwi | ❌ Requiere configuración fiscal completa |

---

*Auditoría completada. Bugs documentados. Información requerida identificada.*
