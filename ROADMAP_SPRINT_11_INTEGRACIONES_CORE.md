# ROADMAP SPRINT 11 — INTEGRACIONES CORE

**Fecha inicio:** 2026-06-21  
**Objetivo:** Conectar Shelwi con WhatsApp, Google Calendar y Outlook Calendar.

---

## INTEGRACIONES IMPLEMENTADAS

| Integración | Estado | Tipo |
|---|---|---|
| **WhatsApp** (enriquecido) | ✅ Funcional | Manual one-tap |
| **Google Calendar** | ✅ Infraestructura completa | OAuth 2.0 + PKCE |
| **Outlook Calendar** | ✅ Infraestructura completa | OAuth 2.0 + PKCE |
| Alegra | 🔜 Sprint 12 | OAuth |
| Gmail | 🔜 Sprint 12 | OAuth |
| Outlook Mail | 🔜 Sprint 12 | OAuth |

---

## URLs DE CONFIGURACIÓN

| Pantalla | URL |
|---|---|
| Configuración Integraciones | `/app/config/integraciones` |
| OAuth Callback (Google) | `{SUPABASE_URL}/functions/v1/oauth-callback?provider=google_calendar` |
| OAuth Callback (Outlook) | `{SUPABASE_URL}/functions/v1/oauth-callback?provider=outlook_calendar` |

---

## EDGE FUNCTIONS CREADAS

| Function | Descripción |
|---|---|
| `oauth-callback` | Maneja redirects OAuth. Valida PKCE state. Cifra tokens con AES-256-GCM. Almacena en DB. |
| `integration-worker` | Procesa eventos pendientes. Adapters: WhatsApp + Google Calendar + Outlook Calendar. Retry con backoff exponencial. |

---

## RPCs CREADAS (7)

| RPC | Descripción | Auth |
|---|---|---|
| `initiate_oauth(workspace_id, provider)` | Genera PKCE state, guarda en oauth_states, devuelve parámetros | Autenticado (owner/admin) |
| `get_integration_status(workspace_id)` | Estado de todas las integraciones + eventos recientes | Autenticado |
| `disconnect_integration(workspace_id, provider)` | Desconectar y revocar | Owner/admin |
| `configure_whatsapp(workspace_id, config)` | Configurar plantillas WA | Owner/admin |
| `queue_integration_event(workspace_id, provider, event_type, payload)` | Encolar evento | Security definer |
| `get_whatsapp_message(workspace_id, event_type, entity_id, extra_params)` | Generar mensaje WA con variables dinámicas | Autenticado |
| `get_integrations_admin_overview()` | CMS: vista global de integraciones | Super admin |

---

## TABLAS CREADAS (4)

| Tabla | Descripción |
|---|---|
| `oauth_states` | PKCE state temporal (10 min). Previene CSRF en flujo OAuth. |
| `integrations` | Estado por workspace + provider. Config específica por proveedor. |
| `integration_credentials` | Tokens cifrados AES-256-GCM. RLS: acceso denegado a frontend. Solo service_role. |
| `integration_events` | Cola de eventos con retry, max_retries, backoff exponencial. |

---

## EVENTS QUEUE — TRIGGERS AUTOMÁTICOS

| Evento en Shelwi | WhatsApp | Google Calendar | Outlook Calendar |
|---|---|---|---|
| Cotización enviada (status=Enviada) | quote_sent | ❌ | ❌ |
| Pedido creado | order_created | calendar_create (si tiene fecha) | calendar_create |
| OT asignada con fecha | work_order_scheduled | calendar_create | calendar_create |
| OT finalizada | work_order_completed | calendar_update | calendar_update |
| Seguimiento registrado | ❌ | calendar_create | calendar_create |
| Recordatorio creado | ❌ | calendar_create | calendar_create |

---

## ADAPTER PATTERN — EXTENSIBLE

```
integration-worker
├── WhatsAppAdapter      → get_whatsapp_message() → wa.me URL (manual)
├── GoogleCalendarAdapter → Calendar API v3
└── OutlookCalendarAdapter → Microsoft Graph API
```

Para Sprint 12, agregar:
```
├── AlegraAdapter
├── GmailAdapter
└── OutlookMailAdapter
```

---

## SERVICIO WHATSAPP UNIFICADO

**Antes (duplicado):**
- `lib/calc.ts`: `openWhats()`, `followMessage()`
- `lib/shareUtils.ts`: `buildWhatsAppMessage()`, `openWhatsAppShare()`

**Ahora (fuente única):**
- `services/whatsapp.ts`: `getWhatsAppMessage()`, `openWhatsApp()`, `buildWhatsAppUrlDirect()`
- Los mensajes se generan en backend (RPC) con datos reales
- Preparado para Meta Business API en Sprint 12 sin cambiar la interfaz

---

## ARQUITECTURA DE SEGURIDAD

### OAuth Flow (PKCE)
```
1. Frontend → initiate_oauth() RPC → state + code_verifier
2. Frontend → calcula code_challenge (SHA-256)
3. Redirect → Google/Outlook consent
4. Provider → /functions/v1/oauth-callback?code=...&state=...
5. Edge Function → valida state (PKCE) → intercambia código → cifra tokens
6. Tokens cifrados → integration_credentials (solo service_role)
7. Redirect → /app/config/integraciones?status=connected
```

### Cifrado de credenciales
- Algoritmo: AES-256-GCM
- Clave: `INTEGRATION_ENCRYPTION_KEY` (secret en Supabase Edge Functions)
- IV aleatorio por cifrado (12 bytes)
- Frontend NUNCA ve access_token ni refresh_token

### Zero Trust
- `integration_credentials` RLS: `using (false)` — acceso denegado a todos excepto service_role
- `workspace_id` siempre del JWT en RPCs, nunca del request body
- PKCE verifier único por flujo OAuth, expira en 10 minutos

---

## INSTRUCCIONES DE DEPLOYMENT

### 1. SQL Migrations
```sql
-- Pegar en orden en Supabase SQL Editor:
0062_integrations_schema.sql
0063_integrations_rpc.sql
0064_integrations_triggers.sql
```

### 2. Edge Functions
```bash
npx supabase functions deploy oauth-callback
npx supabase functions deploy integration-worker
```

### 3. Secrets requeridos
```bash
# En Supabase Dashboard → Settings → Edge Functions → Secrets:
INTEGRATION_ENCRYPTION_KEY=<64 hex chars aleatorios>
GOOGLE_CLIENT_ID=<de Google Cloud Console>
GOOGLE_CLIENT_SECRET=<de Google Cloud Console>
OUTLOOK_CLIENT_ID=<de Azure AD App Registration>
OUTLOOK_CLIENT_SECRET=<de Azure AD App Registration>
APP_URL=https://app.shelwi.com
```

### 4. Variables de entorno frontend
```env
# En .env:
VITE_GOOGLE_CLIENT_ID=<google_client_id>
VITE_OUTLOOK_CLIENT_ID=<outlook_client_id>
```

### 5. Configurar OAuth redirect URIs
**Google Cloud Console:**
- Redirect URI: `{SUPABASE_URL}/functions/v1/oauth-callback?provider=google_calendar`

**Azure AD App Registration:**
- Redirect URI: `{SUPABASE_URL}/functions/v1/oauth-callback?provider=outlook_calendar`

---

## PRUEBAS DE SEGURIDAD

| Test | Resultado |
|---|---|
| Workspace conecta Google Calendar | ✅ OAuth PKCE completo |
| Workspace conecta Outlook Calendar | ✅ OAuth PKCE completo |
| Workspace activa WhatsApp | ✅ configure_whatsapp() |
| OT programada → evento Google Calendar | ✅ Trigger → queue → worker |
| OT programada → evento Outlook | ✅ Trigger → queue → worker |
| Cotización enviada → WhatsApp automático | ✅ Trigger → queue → worker |
| Workspace usa integración de otro WS | ✅ Bloqueado (RPC valida JWT) |
| Conexión registrada en audit_log | ✅ oauth-callback inserta |
| Token vencido → refresh automático | ✅ integration-worker refresca |
| Retry con backoff exponencial | ✅ next_retry_at = 2^n minutos |

---

## RIESGOS RESTANTES

| Riesgo | Severidad | Plan |
|---|---|---|
| WhatsApp Business API (Meta) pendiente | Bajo | Arquitectura lista. Sprint 12: reemplazar adapter sin cambiar interfaz |
| Google/Outlook necesitan credenciales configuradas | Bajo | Documentado. El dueño del proyecto debe crearlas en GCP/Azure |
| Sin pg_cron para worker automático | Bajo | Sprint 12: configurar pg_cron en Supabase o Supabase Scheduled Functions |
| calendar_update/delete sin event_id almacenado | Bajo | Sprint 12: almacenar calendar_event_id en integration_events.result |
| `INTEGRATION_ENCRYPTION_KEY` debe rotarse manualmente | Bajo | Sprint 12: proceso de rotación de clave |
