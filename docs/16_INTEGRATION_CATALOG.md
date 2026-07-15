# INTEGRATION CATALOG — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Catálogo de todas las integraciones externas soportadas
> Fuente: `supabase/migrations/0062-0067`, Edge Functions: `connect-integration`, `alegra-webhook`, `oauth-callback`, `integration-worker`

---

## 1. ARQUITECTURA DE INTEGRACIONES

```
Frontend (UI de Configuración)
      ↓ Bearer JWT
connect-integration (API Key providers) / oauth-callback (OAuth providers)
      ↓ service_role
integration_credentials (tokens cifrados AES-256-GCM)
integration_events (queue)
      ↓ cron
integration-worker Edge Function
      ↓
Proveedor externo (Alegra, WhatsApp, Google, etc.)
      ↓
communication_log / integration_invoices / integration_entity_refs
```

**Principios de seguridad:**
- Los tokens OAuth y API Keys NUNCA se exponen al frontend
- Credenciales cifradas con AES-256-GCM (`INTEGRATION_ENCRYPTION_KEY` secret)
- `workspace_id` siempre obtenido del JWT (Zero Trust — nunca del body)
- Solo roles `owner` / `admin` pueden conectar integraciones
- Toda conexión queda registrada en `audit_log`

---

## 2. PROVEEDORES SOPORTADOS

### 2.1 Alegra (Contabilidad)

**Estado:** ✅ Implementado (Sprint 12)
**Tipo:** API Key (email + token)
**Edge Functions:** `connect-integration`, `alegra-webhook`
**Tablas especiales:** `integration_invoices` — Shelwi conserva copia independiente

| Aspecto | Detalle |
|---|---|
| Autenticación | Basic Auth: `btoa(email:api_token)` |
| Validación | `GET https://app.alegra.com/api/r1/company` al conectar |
| Webhook entrante | `alegra-webhook` con firma HMAC |
| Config almacenada | `{ auto_invoice: boolean, company_name: string }` |
| Sincronización | Facturas bidireccional (Shelwi → Alegra y Alegra → Shelwi) |

**Capacidades:**
- Crear facturas en Alegra desde órdenes de Shelwi
- Sincronizar estado de pago (paid/void/cancelled)
- Recibir webhooks de cambios en Alegra
- Ver facturas Alegra dentro de Shelwi (via `integration_invoices`)

**Flujo de conexión:**
```
1. Admin ingresa alegra_email + alegra_token en UI
2. connect-integration valida contra API de Alegra
3. Si válido: cifra credenciales → guarda en integration_credentials
4. Actualiza integrations.status = 'connected'
5. Registra en audit_log
```

---

### 2.2 WhatsApp Business

**Estado:** ✅ Implementado (Sprint 11)
**Tipo:** OAuth / Meta Business API
**Edge Functions:** `oauth-callback`, `integration-worker`
**Tablas:** `communication_log` para historial

| Aspecto | Detalle |
|---|---|
| Autenticación | OAuth 2.0 con PKCE |
| Proveedor OAuth | Meta / WhatsApp Business API |
| Eventos de cola | `quote_sent`, `followup`, `order_created`, `work_order_scheduled`, `work_order_completed`, `review_request` |
| Modo WhatsApp | URL generator (abre wa.me) — status: 'generated' |

**Capacidades:**
- Enviar cotizaciones vía WhatsApp con PDF adjunto
- Envío de seguimientos automáticos
- Notificar al cliente cuando su pedido está confirmado o completado
- Solicitar reseñas post-servicio
- Historial de comunicaciones en `communication_log`

**Nota:** En modo actual, genera URL wa.me (WhatsApp Web). La API nativa de Meta requiere cuenta Business verificada.

---

### 2.3 Google Calendar

**Estado:** ✅ Implementado (Sprint 11)
**Tipo:** OAuth 2.0 con PKCE
**Edge Functions:** `oauth-callback`, `integration-worker`
**Tablas:** `integration_entity_refs` para `calendar_event_id`

| Aspecto | Detalle |
|---|---|
| Autenticación | OAuth 2.0 / Google Identity |
| Scope requerido | `https://www.googleapis.com/auth/calendar` |
| Eventos cola | `calendar_create`, `calendar_update`, `calendar_delete` |
| Trazabilidad | `integration_entity_refs.external_id` = Google Calendar Event ID |

**Capacidades:**
- Crear eventos de calendario desde tareas, órdenes, work orders
- Actualizar eventos cuando cambia la fecha
- Eliminar eventos al cancelar
- Ver enlace al evento en Google Calendar

---

### 2.4 Outlook Calendar

**Estado:** ✅ Implementado (Sprint 11)
**Tipo:** OAuth 2.0 con PKCE (Microsoft)
**Edge Functions:** `oauth-callback`, `integration-worker`

| Aspecto | Detalle |
|---|---|
| Autenticación | OAuth 2.0 / Microsoft Identity |
| Scope requerido | `Calendars.ReadWrite`, `offline_access` |
| Eventos cola | `calendar_create`, `calendar_update`, `calendar_delete` |

**Capacidades:** Idénticas a Google Calendar, sobre Outlook/Microsoft 365.

---

### 2.5 Gmail

**Estado:** ✅ Schema listo (Sprint 12) — UI pendiente
**Tipo:** OAuth 2.0 (Google)
**Tablas:** `communication_log` con `provider = 'gmail'`

| Aspecto | Detalle |
|---|---|
| Scope requerido | `gmail.send`, `gmail.readonly` |
| Canal | `channel = 'email'` en communication_log |

**Capacidades planificadas:**
- Enviar cotizaciones y facturas directamente desde Gmail del usuario
- Historial de emails enviados desde la empresa en Shelwi
- Ver respuestas del cliente (requiere scope adicional)

---

### 2.6 Outlook Mail

**Estado:** ✅ Schema listo (Sprint 12) — UI pendiente
**Tipo:** OAuth 2.0 (Microsoft)
**Tablas:** `communication_log` con `provider = 'outlook_mail'`

**Capacidades planificadas:** Equivalente a Gmail pero sobre Microsoft 365.

---

### 2.7 MercadoPago

**Estado:** ✅ Implementado (Sprint ~3-4)
**Tipo:** Webhook + API Key (no OAuth)
**Edge Functions:** `mp-webhook`, `create-checkout`

| Aspecto | Detalle |
|---|---|
| Autenticación | HMAC signature en webhook |
| Secret | `MERCADOPAGO_WEBHOOK_SECRET` env var |
| Flujo | `create-checkout` genera preferencia → MP redirige → `mp-webhook` confirma pago |

**Capacidades:**
- Generar link de pago para facturas
- Recibir confirmación de pago automáticamente
- Actualizar estado de factura a 'paid' tras confirmación
- Suscripciones: cobro recurrente de planes Shelwi

---

### 2.8 Stripe

**Estado:** ✅ Implementado — mercado no-LATAM
**Tipo:** API Key + Webhook
**Edge Functions:** `create-checkout`

| Aspecto | Detalle |
|---|---|
| Uso | Checkout para usuarios fuera de LATAM |
| Webhook | Manejado junto con MercadoPago en `mp-webhook` o función separada |

---

### 2.9 OneDrive / Drive

**Estado:** 🔄 Schema listo — integración pendiente
**Tipo:** OAuth 2.0 (Google / Microsoft)
**Tablas:** `integration_entity_refs` con `provider = 'drive'` o `'onedrive'`

**Capacidades planificadas:**
- Subir reportes PDF generados por Shelwi
- Adjuntar documentos del cliente desde Drive/OneDrive
- Backup automático de evidencias de campo

---

### 2.10 Microsoft Teams

**Estado:** 🔄 Schema listo — integración pendiente
**Tipo:** OAuth 2.0 (Microsoft)

**Capacidades planificadas:**
- Notificaciones de Shelwi en canales de Teams
- Aprobar acciones de agentes desde Teams

---

### 2.11 Zapier (vía Webhook)

**Estado:** 🟡 No implementado nativamente — compatible via `trigger.webhook.custom`

Las empresas pueden conectar Shelwi con Zapier usando:
- **Outgoing:** `action.webhook.call` en workflows de Shelwi
- **Incoming:** configurar un webhook externo en Shelwi

---

## 3. FLUJO OAUTH GENÉRICO

```
1. Frontend llama: POST /connect-integration { provider, action: 'oauth_init' }
2. Backend genera state + code_verifier (PKCE) → guarda en oauth_states (10 min TTL)
3. Devuelve URL de autorización del proveedor
4. Usuario aprueba en proveedor
5. Proveedor redirige a oauth-callback Edge Function con code + state
6. Backend verifica state (CSRF), hace code exchange (PKCE)
7. Cifra tokens → guarda en integration_credentials
8. Actualiza integrations.status = 'connected'
9. Redirige al frontend a redirect_to URL
10. Frontend muestra: "¡Conectado!"
```

---

## 4. TABLAS DEL MÓDULO

| Tabla | Descripción |
|---|---|
| `integrations` | Estado de cada integración por workspace (status, config no-sensible) |
| `integration_credentials` | Tokens OAuth/API Keys cifrados AES-256-GCM. RLS: `deny_all_direct_access` |
| `oauth_states` | Estados PKCE temporales (TTL 10 min, auto-limpieza) |
| `integration_events` | Cola de eventos a procesar por `integration-worker` |
| `integration_invoices` | Copia de trazabilidad de facturas Alegra (independiente del proveedor) |
| `integration_entity_refs` | Mapa de IDs externos (calendar_event_id, alegra_invoice_id, etc.) |
| `communication_log` | Historial unificado de comunicaciones (WhatsApp + Gmail + Outlook Mail) |

---

## 5. LÍMITES POR PLAN

| Integración | Free | Start | Growth | Business OS | Enterprise OS |
|---|---|---|---|---|---|
| WhatsApp | ❌ | ✅ | ✅ | ✅ | ✅ |
| Google Calendar | ❌ | ✅ | ✅ | ✅ | ✅ |
| Alegra | ❌ | ✅ | ✅ | ✅ | ✅ |
| Gmail / Outlook Mail | ❌ | ❌ | ✅ | ✅ | ✅ |
| OneDrive / Drive | ❌ | ❌ | ✅ | ✅ | ✅ |
| Teams | ❌ | ❌ | ❌ | ✅ | ✅ |
| MercadoPago | ❌ | ✅ | ✅ | ✅ | ✅ |
| Integraciones máximas | 0 | 2 | 5 | 10 | Ilimitadas |

---

## 6. AGREGAR UNA NUEVA INTEGRACIÓN

Al agregar soporte para un nuevo proveedor:

1. Agregar el provider al `CHECK constraint` en `integrations.provider` (o dejar sin constraint como en `integration_events.event_type`)
2. Definir el flujo: OAuth (vía `oauth-callback`) vs API Key (vía `connect-integration`)
3. Implementar la lógica en `integration-worker` para procesar los eventos
4. Agregar los event_types correspondientes
5. Actualizar este catálogo
6. Crear ADR si cambia la arquitectura de integraciones

---

*Ver: `supabase/functions/connect-integration/index.ts` para implementación API Key (Alegra)*
*Ver: `supabase/functions/oauth-callback/index.ts` para implementación OAuth*
*Ver: `supabase/functions/integration-worker/index.ts` para procesamiento de eventos*
*Ver: `supabase/migrations/0062_integrations_schema.sql` para schema base*
*Ver: `supabase/migrations/0065_integrations_s12_schema.sql` para tablas Sprint 12*
*Ver: `docs/15_AUTOMATION_LIBRARY.md` para acciones `action.webhook.call`*
