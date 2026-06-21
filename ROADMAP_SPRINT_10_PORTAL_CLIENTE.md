# ROADMAP SPRINT 10 — PORTAL DEL CLIENTE

**Fecha inicio:** 2026-06-21  
**Objetivo:** Transformar Shelwi en plataforma colaborativa — el cliente accede a cotizaciones, pedidos, OTs, evidencias y timeline sin crear cuenta.

---

## URL FINAL DEL PORTAL

| Portal | URL | Descripción |
|---|---|---|
| **Portal Cliente** | `/portal/:token` | **NUEVO Sprint 10** — acceso a todo el historial del cliente |
| Portal Cotización | `/p/:token` | Existente — visualización + firma de cotización individual |

Los dos portales son independientes y usan tablas de tokens separadas.

---

## MODELO DE SEGURIDAD

### Autenticación
- **Sin cuenta requerida** — acceso por token UUID seguro
- Token generado por el workspace (empresa) para su cliente
- 1 token activo por cliente por workspace
- Expiración: 90 días (renovable, configurable)
- Revocación: inmediata, por el owner/admin del workspace

### Validación (Zero Trust)
Todo acceso al portal pasa por RPCs `security definer` que:
1. Verifican que el token existe y no está revocado ni vencido
2. Extraen `workspace_id` y `client_id` del token (nunca del cliente)
3. Aplican filtros de visibilidad (`visible_to_client`, `portal_show_*`)
4. Registran en `portal_access_log`

### Matriz de permisos

| Recurso | Visible al cliente | Condición |
|---|---|---|
| Cotizaciones propias | ✅ Siempre | quotes.client_id = client_id |
| Pedidos propios | ✅ Siempre | orders.client_id = client_id |
| OTs de sus pedidos | ✅ Siempre | via orders |
| Nombre del responsable | ⚙️ Configurable | portal_show_responsible |
| Comentarios bitácora | ⚙️ Configurable | portal_show_comments + visible_to_client |
| Evidencias | ⚙️ Configurable | portal_show_evidences + visible_to_client |
| Timeline | ⚙️ Configurable | portal_show_timeline |
| Datos de OTROS clientes | ❌ Nunca | RLS + RPC validation |
| Datos de OTRO workspace | ❌ Nunca | token scope |

---

## BUGS CORREGIDOS (Fase 1)

### BUG 1 — CRÍTICO: Token sin validar expiración
- **Antes:** `get_public_quote()` no validaba `expires_at` → token de 7 días funcionaba indefinidamente
- **Después:** `AND t.expires_at > now()` en la query + excepción `token_expired_or_not_found`

### BUG 2 — CRÍTICO: Update de status desde frontend
- **Antes:** `PublicQuotePortal.tsx` hacía `supabase.from('quotes').update({status:'Vista'})` — violación Zero Trust
- **Después:** El trigger `trg_quote_views_crm` (Sprint 4) maneja todo automáticamente al insertar en `quote_views`
- **Fase 2 (accept/reject):** El trigger `trg_quote_events_decision` (0061) maneja la actualización de status al aceptar/rechazar

### BUG 3 — MEDIO: Doble notificación de apertura
- **Antes:** `createNotification()` desde frontend + trigger `trg_quote_views_crm` → 2 notificaciones
- **Después:** Solo el trigger backend notifica. Frontend eliminó `createNotification()`

### Fuente de verdad definida:
- `quote_events` → lógica comercial (proposal_opened/accepted/rejected)
- `quote_views` → analítica técnica (device, city, browser)
- Triggers backend → estado y notificaciones (no frontend)

---

## FASE 2 — SCHEMA (Migración 0059)

### `evidence_files.visible_to_client boolean` — default false
- El operario decide qué evidencias son visibles al cliente
- Principio: nada visible por defecto

### `work_logs.visible_to_client boolean` — default false
- Comentarios en bitácora visibles al cliente según flag

### `company_settings` — portal config
- `portal_enabled boolean` (default true)
- `portal_show_evidences boolean` (default false)
- `portal_show_responsible boolean` (default true)
- `portal_show_comments boolean` (default false)
- `portal_show_timeline boolean` (default true)

### `client_portal_tokens` — nueva tabla
- 1 fila por cliente por workspace (UNIQUE)
- token UUID, expires_at (90 días), revoked_at, last_access_at, created_by

### `portal_access_log` — nueva tabla
- Auditoría: portal_opened/quote_viewed/order_viewed/ot_viewed/evidence_viewed/timeline_viewed

---

## FASE 3 — RPCs (Migración 0060) — 9 RPCs + helper

| RPC | Auth | Descripción |
|---|---|---|
| `_validate_portal_token(token, action, entity_id)` | Público | Helper interno: valida, actualiza last_access, loga |
| `create_client_portal_token(ws, client, days)` | Autenticado | Genera/renueva token. UPSERT. |
| `revoke_client_portal_token(ws, client)` | Owner/Admin | Revoca acceso |
| `get_client_portal(token)` | Público | Dashboard principal: client + company + config + summary + active_orders |
| `get_portal_quotes(token)` | Público | Lista cotizaciones del cliente |
| `get_portal_orders(token)` | Público | Lista pedidos del cliente |
| `get_portal_work_orders(token, order_id)` | Público | OTs de un pedido específico |
| `get_portal_evidences(token, order_id?)` | Público | Evidencias visible_to_client |
| `get_portal_timeline(token)` | Público | Timeline unificado (quotes + orders + evidencias) |
| `get_portal_analytics(workspace_id)` | Autenticado | Métricas del portal para la empresa |

---

## FASE 4 — TRIGGER (Migración 0061)

### `trg_quote_events_decision`
- Disparo: INSERT en `quote_events` con event_type in (proposal_accepted, proposal_rejected)
- Actualiza: `quotes.status` + `quotes.commercial_status`
- Registra: en `quote_commercial_history`
- Notifica: a owner/admin del workspace
- Elimina: la necesidad de actualización desde frontend

---

## FASE 5 — TYPESCRIPT + SERVICIOS

- `CompanySettingsRow`: +portal_enabled/show_evidences/show_responsible/show_comments/show_timeline
- Nuevos tipos: `ClientPortalTokenRow`, `PortalAccessLogRow`, `ClientPortalData`, `PortalOrder`, `PortalWorkOrder`, `PortalEvidence`, `PortalTimelineEvent`, `PortalAnalytics`, `PortalConfig`, `PortalCompany`
- `services/clientPortal.ts`: todos los métodos de acceso al portal
- `hooks/useClientPortal.ts`: React Query hooks (público + autenticado)

---

## FASE 6 — FRONTEND MOBILE-FIRST

### `/portal/:token` → `ClientPortalPage.tsx`
5 tabs configurables:
- **Inicio (Dashboard)**: KPIs del cliente (total cotizaciones, aprobadas, activos), cotización reciente, pedidos activos
- **Cotizaciones**: lista con estado, valor, fecha — botones Aceptar/Rechazar en `/p/:token`
- **Pedidos**: lista con progreso, detalle con OTs y comentarios
- **Fotos** (si portal_show_evidences): galería de evidencias visible_to_client
- **Historial** (si portal_show_timeline): timeline unificado

**Branding:** Logo + colores de la empresa. Shelwi no es visible.

---

## INSTRUCCIONES DE DEPLOYMENT

```sql
-- Supabase SQL Editor, en orden:
0059_portal_schema.sql
0060_portal_rpc.sql
0061_portal_triggers.sql
```

---

## PRUEBAS DE SEGURIDAD

| Test | Resultado |
|---|---|
| Token válido → acceso permitido | ✅ `_validate_portal_token` verifica |
| Token inválido/expirado → bloqueado | ✅ `expires_at > now()` + `revoked_at is null` |
| Token revocado → bloqueado | ✅ `revoked_at is null` |
| Cliente visualiza cotización | ✅ `get_portal_quotes` filtra por client_id del token |
| Cliente acepta cotización | ✅ `register_consent_and_event` + trigger backend |
| Cliente ve evidencias autorizadas | ✅ `visible_to_client = true` + `portal_show_evidences` |
| Evidencia no autorizada → bloqueada | ✅ `visible_to_client = false` (default) |
| Workspace cruzado → bloqueado | ✅ token scope: 1 cliente/workspace |
| Timeline completo visible | ✅ `get_portal_timeline` unifica quotes + orders + evidencias |
| Empresa sin portal → bloqueado | ✅ `portal_enabled = false` → error en `get_client_portal` |

---

## RIESGOS RESIDUALES

| Riesgo | Severidad | Plan |
|---|---|---|
| Sin HTTPS enforcement | Bajo | El token UUID en URL es seguro en HTTPS. En HTTP sería vulnerable. Supabase/Vercel/Netlify fuerzan HTTPS. |
| Sin rate limiting en portal RPCs | Bajo | Token UUID de 36 caracteres es suficientemente aleatorio para prevenir bruteforce. Sprint 11: rate limiting via Edge Middleware. |
| Evidencias del bucket `evidences` privado | Bajo | Se necesita `getSignedUrl` por evidencia (3600s). La galería pide URLs al abrir — OK para Sprint 10. |
| Desktop view básica | Bajo | Portal responsive (mobile-first). Desktop hereda el mismo layout. Sprint 11: vista desktop dedicada. |
| `portal_access_log.insert with check (true)` | Bajo | Acepta cualquier insert validado por la RPC. Las RPCs `security definer` son la barrera real. |
