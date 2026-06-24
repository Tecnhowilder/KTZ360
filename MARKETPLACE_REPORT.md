# MARKETPLACE_REPORT.md
# Shelwi — Auditoría Marketplace de Integraciones (Webhooks Salientes)
Fecha: 2026-06-23

---

## 1. INVENTARIO — LO QUE YA EXISTE (NO DUPLICAR)

### Infraestructura de eventos (Sprints 11–13)

| Componente | Estado | Descripción |
|-----------|--------|-------------|
| `integration_events` | ✅ EXISTE | Cola asíncrona de eventos. `provider` + `event_type` + `payload`. Sin CHECK constraint en event_type (quitado en 0065 para flexibilidad). |
| `integrations` | ✅ EXISTE | Estado de conexión por workspace+provider. Tiene `config jsonb`. |
| `integration_credentials` | ✅ EXISTE | Credenciales cifradas AES-256-GCM. |
| `integration-worker` Edge Function | ✅ EXISTE | Procesa eventos de `integration_events`. MAX 5 por run. Dispatch por `provider`. |
| `provider = 'shelwi_internal'` | ✅ EXISTE | Motor interno de automatizaciones. Reutilizable para webhooks. |
| `connect-integration` Edge Function | ✅ EXISTE | Conecta/desconecta proveedores. Encripta credenciales. |

### Triggers de dispatch que ya existen (Sprint 13)

| Trigger | Eventos que dispara | Estado |
|---------|---------------------|--------|
| `trg_quotes_automation_dispatch` | `quote_created`, `quote_sent`, `quote_approved`, `quote_rejected` | ✅ EXISTE |
| `trg_orders_automation_dispatch` | `order_created`, `order_status_changed` | ✅ EXISTE |
| `trg_work_orders_automation_dispatch` | `work_order_created`, `work_order_status_changed` | ✅ EXISTE |
| `trg_clients_automation_dispatch` | `client_created` | ✅ EXISTE |

**Conclusión clave:** Los triggers YA capturan todos los eventos del sprint (`quote_created`, `quote_approved`, `order_created`, `work_order_created`, `work_order_completed`). El payload ya está construido con `quote_id`, `client_name`, `total`, etc.

### Providers en `integrations` tabla

Actualmente: `'whatsapp', 'google_calendar', 'outlook_calendar', 'alegra', 'gmail', 'outlook_mail', 'drive', 'onedrive', 'teams'`

**Zapier, Make, n8n: NO existen como providers.**

### Plan features

No existe `plan_features.webhook_enabled` ni ninguna feature flag para webhooks.

---

## 2. GAPS REALES — LO QUE FALTA CREAR

### Gap 1 — Tabla `webhook_endpoints` (nueva)

No existe ninguna tabla para que el workspace configure sus destinos de webhook.
Necesita: `url`, `secret` (para firma HMAC-SHA256), `events` (array de eventos activos), `active`.

### Gap 2 — Tabla `webhook_deliveries` (nueva)

No existe log de entregas: qué se envió, cuándo, resultado HTTP, reintentos.
Crítico para debugging y para el CMS del Admin.

### Gap 3 — Providers `zapier`, `make`, `n8n` en `integrations`

El CHECK constraint en `integrations.provider` no incluye estos providers.
Pero en 0065 se quitó el CHECK de `integration_events.event_type`, lo que da flexibilidad.
Para `integrations.provider` hay que extender el CHECK constraint.

### Gap 4 — Lógica de envío de webhook en `integration-worker`

No existe handler para `provider IN ('zapier', 'make', 'n8n')`.
El worker necesita un nuevo case en el switch para llamar al endpoint externo del workspace con HMAC signature.

### Gap 5 — RPC `queue_webhook_event` / `register_webhook_endpoint`

No existen RPCs de administración para:
- Registrar un endpoint (URL + secret + eventos)
- Activar/desactivar un endpoint
- Ver historial de entregas
- Reenviar entrega fallida

### Gap 6 — CMS en AdminPanel (tab Marketplace)

No existe ninguna UI para gestionar webhooks salientes ni un Marketplace.

### Gap 7 — Plan feature gating

No existe `webhook_enabled` en `plan_features`. Los webhooks salientes deben ser PRO+ (no FREE).

---

## 3. ARQUITECTURA PROPUESTA

### Flujo completo

```
Evento DB (INSERT/UPDATE)
    ↓
Trigger existente (trg_quotes_automation_dispatch, etc.)
    ↓
evaluate_and_queue_automations() [ya existe]
    ↓ [SI hay webhook configurado para ese evento]
integration_events INSERT (provider='webhook', event_type='quote_approved', payload={...})
    ↓
integration-worker [cada minuto via pg_cron]
    ↓
processWebhookDelivery():
  1. Cargar webhook_endpoints activos para workspace + event
  2. Para cada endpoint:
     a. Construir payload firmado con HMAC-SHA256
     b. POST al endpoint del usuario (Zapier/Make/n8n/custom URL)
     c. Registrar resultado en webhook_deliveries
     d. Reintento automático si falla (max 3 reintentos)
```

### Firma HMAC-SHA256

```
X-Shelwi-Signature: sha256=<hmac(secret, body)>
X-Shelwi-Event: quote_approved
X-Shelwi-Delivery: <delivery_uuid>
X-Shelwi-Timestamp: <unix_timestamp>
Content-Type: application/json
```

El receptor (Zapier/Make/n8n) verifica la firma con el secret configurado.

---

## 4. PLAN DE IMPLEMENTACIÓN

### Migración 0093 — Schema Webhooks

```sql
-- webhook_endpoints: configuración de destinos
-- webhook_deliveries: log de entregas
-- ALTER TABLE integrations: añadir 'webhook' a providers
-- ALTER TABLE plan_features: añadir webhook_enabled
-- insert plan_features webhook_enabled = false(free), true(pro), true(premium)
```

### Migración 0094 — RPCs Webhooks

```sql
-- register_webhook_endpoint(workspace_id, url, secret, events[], label)
-- update_webhook_endpoint(workspace_id, endpoint_id, ...)
-- delete_webhook_endpoint(workspace_id, endpoint_id)
-- get_webhook_endpoints(workspace_id)
-- get_webhook_deliveries(workspace_id, endpoint_id?, limit)
-- redeliver_webhook(workspace_id, delivery_id)
-- test_webhook_endpoint(workspace_id, endpoint_id) → envía payload de prueba
```

### Migración 0095 — Dispatch Triggers Update

Los triggers de Sprint 13 ya existen. Solo añadir lógica para encolar webhook si hay endpoints activos para ese evento y workspace.

### Edge Function `integration-worker` — Nuevo handler

```typescript
case 'webhook':
  return processWebhookDelivery(admin, event);
```

`processWebhookDelivery`: carga webhook_endpoints activos → construye payload → firma HMAC → POST → registra en webhook_deliveries.

### Frontend

- `src/components/admin/MarketplaceTab.tsx` — CMS admin (gestión global)
- `src/views/config/WebhooksPage.tsx` — Vista por workspace para configurar webhooks
- Router: `/app/config/webhooks`

---

## 5. REUTILIZACIÓN VS NUEVO

| Componente | Decisión |
|-----------|---------|
| `integration_events` | ✅ REUTILIZAR — añadir `provider='webhook'` |
| `integration-worker` dispatch | ✅ EXTENDER — nuevo case en switch |
| `connect-integration` Edge Function | ✅ REUTILIZAR — manejar action='webhook_connect' |
| Triggers `trg_*_automation_dispatch` | ✅ EXTENDER — ya capturan los eventos necesarios |
| `webhook_endpoints` tabla | ❌ CREAR NUEVA — no existe |
| `webhook_deliveries` tabla | ❌ CREAR NUEVA — no existe |
| Firma HMAC-SHA256 | ❌ IMPLEMENTAR — no existe para webhooks salientes |

---

## 6. SEGURIDAD

| Control | Implementación |
|---------|---------------|
| Firma HMAC-SHA256 | Secret del workspace × body del payload |
| Secret nunca expuesto | Almacenado cifrado en `webhook_endpoints.secret_hash` (bcrypt) o `integration_credentials` (AES-256-GCM) |
| Zero Trust | workspace_id del JWT en todos los RPCs |
| Rate limiting | Max 3 reintentos por entrega, exponential backoff |
| Timeout | 10 segundos por intento de entrega |
| URL validation | Validar HTTPS obligatorio, no localhost en producción |
| Plan gating | `webhook_enabled = false` en FREE |
| Workspace isolation | RLS en `webhook_endpoints` y `webhook_deliveries` |

---

*Auditoría completada. Ningún código escrito. Listo para implementar.*
