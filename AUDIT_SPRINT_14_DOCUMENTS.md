# AUDIT SPRINT 14 — Documentos, Respaldo y Colaboración

> **Fecha auditoría:** 2026-06-21  
> **Auditor:** OpenCode Agent  
> **Regla aplicada:** *No programar hasta terminar auditoría.*  
> **Principio rector:** **SHELWI ES LA FUENTE DE VERDAD.** Todo archivo existe primero en Supabase Storage; Drive/OneDrive/Teams son respaldo, sincronización y colaboración. Ninguna funcionalidad crítica depende de terceros.

---

## 1. RESUMEN EJECUTIVO

| Área | Estado global |
|---|---|
| Storage centralizado (Shelwi/Supabase) | **EXISTE** — bucket `evidences`, cuota PREMIUM 5 GB, RLS por workspace, Zero Trust en RPCs. |
| Google Drive como respaldo | **FALTA** — provider `drive` declarado en schema/RLS pero sin adapter ni flujo de sincronización. |
| OneDrive como respaldo | **FALTA** — provider `onedrive` declarado en schema/RLS pero sin adapter ni flujo de sincronización. |
| Microsoft Teams (notificaciones) | **FALTA** — provider `teams` declarado pero sin adapter ni eventos. |
| Sincronización automática ON/OFF | **PARCIAL** — worker existe con cron, pero no hay flag `auto_sync` por proveedor. |
| Documentos sincronizados en pedidos | **FALTA** — no hay UI de "Documentos sincronizados" ni refs de archivos en Drive/OneDrive. |
| Widget de almacenamiento en Dashboard | **PARCIAL** — hook `useStorageUsage` + `StorageAdminTab` CMS existen; widget de dashboard principal no. |
| CMS Storage & Sync | **PARCIAL** — solo "Storage"; faltan sincronizaciones, errores y uso promedio. |
| Seguridad de credenciales | **EXISTE** — AES-256-GCM, credenciales con RLS `deny_all_direct_access_credentials`. |
| Paquetes de almacenamiento adicionales | **FALTA** — modelos/frontend no implementan +10/25/50 GB recurrentes. |
| BYOS (Bring Your Own Storage) | **NO IMPLEMENTAR** — documentado como futuro, correctamente pendiente. |

---

## 2. STORAGE Y CUOTAS

### 2.1 Buckets

| Bucket | Propósito | Público | RLS por workspace | Estado |
|---|---|---|---|---|
| `evidences` | Fotos, videos, audios, PDFs, firmas de pedidos/OTs | No | Sí (`workspace_id` primer folder) | **EXISTE** (`0004_storage.sql`, `0053_evidences_schema.sql`) |
| `attachments` | Fotos de proyectos/cotizaciones/clientes (legacy) | No | Sí | **EXISTE** (`0001_schema.sql`) |
| `logos` | Logo de empresa para PDF/branding | Sí | Sí | **EXISTE** (`0004_storage.sql`) |

**Observación:** El bucket activo para evidencias operativas es `evidences`. `attachments` aún existe como tabla legacy (`public.attachments`) pero no se observa uso reciente en el flujo de evidencias Sprint 7.

### 2.2 Tablas de archivos

| Tabla | Propósito | Estado |
|---|---|---|
| `public.evidence_files` | Registro maestro de evidencias con `storage_path`, `file_size`, `mime_type`, `file_type` | **EXISTE** |
| `public.attachments` | Tabla legacy genérica (`entity_type`, `entity_id`, `file_path`) | **EXISTE/LEGACY** |

**Riesgo:** `public.attachments` está en schema base pero no está integrada con el sistema de cuotas Sprint 7. Cualquier resurrección de esta tabla sin control de `storage_used_bytes` rompería el principio "Shelwi es la fuente de verdad".

### 2.3 Cuotas y monetización

| Componente | Detalle | Estado |
|---|---|---|
| `plan_limits.max_storage_gb` | Límite por plan | **EXISTE** (`0035_plans_v2.sql`) — FREE=null, PRO=null, PREMIUM=5 |
| `workspaces.storage_used_bytes` | Contador O(1) de bytes usados | **EXISTE** (`0053_evidences_schema.sql`) |
| `check_evidence_quota()` | Valida espacio disponible | **EXISTE** |
| `check_evidence_upload_allowed()` | Pre-validación de upload | **EXISTE** |
| Paquetes +10 GB / +25 GB / +50 GB recurrentes | Modelo de upgrades | **FALTA** |
| Bloqueo al cancelar paquete (no borrar, solo bloquear nuevas cargas) | Lógica de negocio | **FALTA** |

**Cuotas oficiales actuales:**

| Plan | GB incluidos | Implementado |
|---|---|---|
| FREE | 0 GB | Sí (`storage_enabled=false`) |
| PRO | 0 GB | Sí (`storage_enabled=false`) |
| PREMIUM | 5 GB | Sí (`max_storage_gb=5`, `storage_enabled=true`) |

**Reutilizable:**
- `check_evidence_quota()` y `storage_used_bytes` son la base para paquetes adicionales: solo hay que restar `extra_storage_bytes` activo del workspace al calcular `max_bytes`.
- `register_evidence_file()` y `delete_evidence_file()` ya actualizan el contador; no requieren cambios si la cuota se calcula en `check_evidence_quota()`.

---

## 3. INTEGRACIONES (Drive / OneDrive / Teams)

### 3.1 Schema de integraciones

| Componente | Detalle | Estado |
|---|---|---|
| `public.integrations` | Tabla de proveedores con `provider`, `enabled`, `status`, `config`, `last_sync_at`, `last_error` | **EXISTE** |
| `public.integration_credentials` | Tokens OAuth/API Key cifrados con AES-256-GCM | **EXISTE** |
| `public.integration_events` | Cola de eventos sin CHECK constraint (flexible) | **EXISTE** |
| `public.integration_entity_refs` | IDs externos genéricos (`external_id`, `external_url`) | **EXISTE** (Sprint 12) |
| `public.communication_log` | Historial unificado (WhatsApp/Gmail/Outlook Mail) | **EXISTE** (Sprint 12) |

**Whitelist de providers en DB (`0062_integrations_schema.sql` + `0063_integrations_rpc.sql`):**

```sql
'whatsapp', 'google_calendar', 'outlook_calendar',
'alegra', 'gmail', 'outlook_mail', 'drive', 'onedrive', 'teams'
```

**Estado:** `drive`, `onedrive`, `teams` ya están en el enum/check de providers, listos para activarse sin migraciones destructivas.

### 3.2 Drive

| Capacidad | Estado | Detalle |
|---|---|---|
| Provider en DB | **EXISTE** | Enum incluye `'drive'` |
| OAuth / credenciales | **FALTA** | No hay `GOOGLE_DRIVE_*` secrets ni scopes en Edge Functions |
| Google Drive Adapter | **FALTA** | `integration-worker/index.ts` no tiene `case 'drive'` |
| Evento `drive_sync` tras `evidence_uploaded` | **FALTA** | Trigger/RPC no encola eventos `drive_sync` |
| Guardar `drive_file_id` / `drive_url` en `integration_entity_refs` | **FALTA** |helper `upsert_entity_ref()` **EXISTE** y es reutilizable |

### 3.3 OneDrive

| Capacidad | Estado | Detalle |
|---|---|---|
| Provider en DB | **EXISTE** | Enum incluye `'onedrive'` |
| OAuth / credenciales Microsoft Graph Files | **FALTA** | Scope usado hoy es `Calendars.ReadWrite`; falta `Files.ReadWrite` |
| OneDrive Adapter | **FALTA** | No implementado en worker |
| Evento `onedrive_sync` | **FALTA** | No se encola |
| Guardar `onedrive_file_id` / `webUrl` | **FALTA** | `upsert_entity_ref()` reutilizable |

### 3.4 Microsoft Teams

| Capacidad | Estado | Detalle |
|---|---|---|
| Provider en DB | **EXISTE** | Enum incluye `'teams'` |
| Adapter Teams | **FALTA** | Sin `TeamsAdapter` |
| Notificaciones OT creada/retrasada/finalizada/incidencia | **FALTA** | No hay eventos `teams_*` ni triggers |
| Scope Graph `ChannelMessage.Send` | **FALTA** | No configurado |

**Observación arquitectónica crítica:** Teams **solo debe recibir eventos, nunca almacenar datos críticos**. El diseño actual de `integration_events` (cola de eventos + worker stateless) cumple este principio.

### 3.5 Conexión / desconexión

| Capacidad | Estado |
|---|---|
| `initiate_oauth()` soporta `google_calendar` y `outlook_calendar` | **EXISTE** |
| `initiate_oauth()` para `drive` / `onedrive` / `teams` | **FALTA** |
| `oauth-callback` Edge Function | **EXISTE** (solo calendar hoy) |
| `connect-integration` Edge Function | **EXISTE** (solo Alegra hoy) |
| `disconnect_integration()` RPC | **EXISTE** |
| Config `auto_sync` ON/OFF por proveedor | **FALTA** |

---

## 4. FLUJO DE UPLOAD: ¿TODO PASA POR SHELWI?

### 4.1 Flujo actual evidencias (Sprint 7)

```
Usuario
  ↓
compressImage() (cliente)
  ↓
check_evidence_upload_allowed() → valida cuota/plan/mime
  ↓
supabase.storage.from('evidences').upload(path, file)  ← RLS
  ↓
register_evidence_file() → actualiza storage_used_bytes + work_logs
```

**Veredicto:** Sí, todo pasa por Supabase Storage primero. No hay upload directo a Drive/OneDrive.

### 4.2 Refuerzos de seguridad

| Capacidad | Estado | Detalle |
|---|---|---|
| Tokens nunca expuestos al frontend | **EXISTE** | `integration_credentials` tiene policy `deny_all_direct_access_credentials` |
| Cifrado AES-256-GCM | **EXISTE** | `oauth-callback`, `connect-integration`, `integration-worker` |
| Upload directo a Drive/OneDrive desde frontend | **NO PERMITIDO** | No existe código que lo haga |
| Validación de cuota en backend | **EXISTE** | `check_evidence_upload_allowed()` + `register_evidence_file()` double check |

---

## 5. OPERACIONES

### 5.1 Pedidos (`public.orders`)

| Capacidad | Estado |
|---|---|
| Schema base con `workspace_id`, `status`, `order_snapshot` | **EXISTE** |
| Trigger auto-factura Alegra al finalizar | **EXISTE** (`trg_integrations_order_finalizado`) |
| Trigger auto-sync evidencia → Drive/OneDrive | **FALTA** |
| Sección "Documentos sincronizados" en UI | **FALTA** |
| Acciones: Abrir / Ver historial / Reintentar sync | **FALTA** |

### 5.2 Órdenes de trabajo (`public.work_orders`)

| Capacidad | Estado |
|---|---|
| Schema base | **EXISTE** |
| TriggerWhatsApp/Calendar al cambiar estado | **EXISTE** |
| Trigger Teams OT creada/retrasada/finalizada | **FALTA** |
| Evidencias asociadas a OT | **EXISTE** (`evidence_files.work_order_id`) |

### 5.3 Bitácora (`public.work_logs`)

| Capacidad | Estado |
|---|---|
| event_type incluye `evidence_uploaded`, `evidence_deleted` | **EXISTE** (`0055_evidences_triggers.sql`) |
| `visible_to_client` | **EXISTE** (`0059_portal_schema.sql`) |
| eventos de sync Drive/OneDrive/Teams | **FALTA** |

---

## 6. PORTAL DEL CLIENTE

| Capacidad | Estado |
|---|---|
| `evidence_files.visible_to_client` default `false` | **EXISTE** |
| `company_settings.portal_show_evidences` | **EXISTE** |
| `client_portal_tokens` | **EXISTE** |
| `portal_access_log` | **EXISTE** |
| "Documentos" como categoría separada en portal | **FALTA** |
| Branding del portal (logo/colores) | **PARCIAL** — `company_settings.logo_path` y `pdf_templates.config` existen; UI de branding avanzado no revisado. |

---

## 7. DASHBOARD

| Widget solicitado | Estado actual | Ubicación existente |
|---|---|---|
| Almacenamiento (espacio usado) | **PARCIAL** | `useStorageUsage()` + `get_storage_usage()` existen; no hay widget en `Dashboard.tsx` |
| Cantidad de archivos | **PARCIAL** | Disponible en `get_storage_usage()` (`by_type`, `recent_files`) |
| Sincronizaciones Drive / OneDrive | **FALTA** | No hay datos de sync por archivo |
| Errores de sincronización | **PARCIAL** | `integration_events.last_error` existe pero no hay widget dedicado |

---

## 8. CMS ADMIN (`/app/admin`)

| Módulo solicitado | Estado |
|---|---|
| "Storage & Sync" | **PARCIAL** — Tab `storage` existe (`StorageAdminTab`) mostrando uso por workspace, pero no sincronizaciones ni errores. |
| Workspaces con más consumo | **EXISTE** (`admin_get_storage_global` RPC) |
| Sincronizaciones | **FALTA** |
| Errores | **FALTA** |
| Uso promedio | **FALTA** |

---

## 9. PAQUETES ADICIONALES DE ALMACENAMIENTO

| Requisito | Estado |
|---|---|
| Modelo de suscripción de paquetes +10/+25/+50 GB | **FALTA** |
| Precios $14.900 / $24.900 / $35.900 mensuales | **FALTA** |
| Campo `workspace.storage_addon_bytes` o similar | **FALTA** |
| Cancelación: no eliminar archivos, bloquear nuevas cargas | **FALTA** — requiere estado `addon_status` separado de `storage_used_bytes` |

**Recomendación de diseño:** agregar `workspace_storage_addons` (id, workspace_id, gb, status active/cancelled, valid_until) y modificar `check_evidence_quota()` para sumar GB activos a `plan_limits.max_storage_gb`.

---

## 10. BYOS — BRING YOUR OWN STORAGE

| Opción | Estado |
|---|---|
| Guardar solo en Drive | **NO IMPLEMENTAR** — correctamente fuera de scope |
| Guardar solo en OneDrive | **NO IMPLEMENTAR** — correctamente fuera de scope |
| Guardar en ambos | **NO IMPLEMENTAR** — correctamente fuera de scope |

**Riesgo documentado:** si en el futuro se implementa BYOS, debe mantenerse la regla de que Shelwi sigue teniendo al menos una copia maestra; de lo contrario se rompe el principio arquitectónico.

---

## 11. RIESGOS IDENTIFICADOS

| # | Riesgo | Severidad | Mitigación propuesta |
|---|---|---|---|
| R1 | `public.attachments` legacy podría usarse para evadir cuotas | Medio | Auditar usos en frontend; si se resucita, unificar a `evidence_files` o agregarle cuota. |
| R2 | `oauth-callback` detecta provider por `scope.includes('calendar')`, lo que puede confundirse con scopes de Drive | Medio | Normalizar `provider` obligatorio en callback y soportar scopes `drive.file`, `Files.ReadWrite`, `ChannelMessage.Send`. |
| R3 | `integration-worker` no tiene adapters Drive/OneDrive/Teams; al encolar eventos sin adapter, quedarían fallando hasta implementarlos | Bajo | Registrar primero los adapters antes de encolar eventos de producción. |
| R4 | Falta modelo de paquetes de almacenamiento; si se venden sin modelo, no hay forma de controlar cuota ni cancelaciones | Alto | Crear tabla `workspace_storage_addons` **antes** de habilitar cobro. |
| R5 | Dashboard no muestra storage al usuario; riesgo de que exceda cuota sin aviso previo | Medio | Agregar widget de almacenamiento; ya existen las alertas al 80/90/100% vía notificaciones. |
| R6 | `storage_used_bytes` solo se actualiza por `evidence_files`; si se sincronizan archivos a Drive/OneDrive sin pasar por evidencias, la cuota no reflejará copias externas | Bajo | Aceptable: Drive/OneDrive son respaldo, no almacenamiento principal; la cuota sigue siendo de Shelwi. |

---

## 12. REUTILIZABLE PARA SPRINT 14

| Componente | Qué reutilizar |
|---|---|
| `integration_events` | Agregar eventos `drive_sync`, `onedrive_sync`, `teams_*` sin migraciones (CHECK constraint eliminado en Sprint 12). |
| `integration_entity_refs` | Guardar `drive_file_id`/`drive_url`, `onedrive_file_id`/`webUrl`, `teams_message_id`. |
| `upsert_entity_ref()` RPC | Ya permite guardar cualquier ID externo genérico. |
| `queue_integration_event()` RPC | Encolar eventos para proveedores activos. |
| `oauth-callback` Edge Function | Extender para scopes de Drive y OneDrive; reutilizar cifrado y upsert de credenciales. |
| `connect-integration` Edge Function | Reutilizar patrón de validación de API key si se decide conexión no-OAuth (no recomendado para Drive/OneDrive). |
| `integration-worker` | Agregar `DriveAdapter`, `OneDriveAdapter`, `TeamsAdapter` en el router `processEvent()`. |
| `check_evidence_quota()` | Base para paquetes adicionales: sumar `active addon GB` al `max_bytes`. |
| `register_evidence_file()` | Trigger natural para encolar `drive_sync` / `onedrive_sync` (post-insert). |
| `StorageAdminTab` | Extender con tabs Sincronizaciones/Errores/Uso promedio. |
| `useStorageUsage()` / `get_storage_usage()` | Base para widget de dashboard de almacenamiento. |

---

## 13. MATRIZ DE TRABAJO POR FASE

| Fase | Requisito | Estado antes de codificar |
|---|---|---|
| 1 | Storage centralizado | **LISTO** — ya es fuente de verdad. Solo validar que nuevos flujos no rompan RLS. |
| 2 | Google Drive Adapter | **FALTA** — requiere implementación completa. |
| 3 | OneDrive Adapter | **FALTA** — requiere implementación completa. |
| 4 | Teams notificaciones | **FALTA** — requiere adapter + triggers. |
| 5 | Config sincronización automática ON/OFF | **FALTA** — agregar campo `config.auto_sync` en `integrations`. |
| 6 | Documentos sincronizados en pedidos | **FALTA** — UI + lógica de refs. |
| 7 | Dashboard widget almacenamiento | **FALTA** — componente nuevo. |
| 8 | CMS Storage & Sync | **PARCIAL** — extender `StorageAdminTab`. |
| 9 | Seguridad | **LISTO** — mantener cifrado y RLS existente. |
| 10 | BYOS | **NO IMPLEMENTAR** — documentar como futuro. |

---

## 14. CONCLUSIÓN Y PRÓXIMOS PASOS RECOMENDADOS

1. **Aprobar esta auditoría** antes de escribir migraciones o código.
2. **Diseñar modelo de paquetes de almacenamiento** (`workspace_storage_addons`) antes de tocar frontend de compras.
3. **Implementar adapters en este orden:** Drive → OneDrive → Teams, reutilizando `integration_events`, `integration_entity_refs` y cifrado existente.
4. **Agregar trigger `evidence_uploaded` → encolar `drive_sync` / `onedrive_sync`** solo si el proveedor está conectado y `config.auto_sync = true`.
5. **No** implementar BYOS ni permitir upload directo a terceros desde frontend.
6. **Mantener** `storage_used_bytes` calculado únicamente desde `evidence_files`/Supabase Storage.

---

*Documento generado conforme a la regla de negocio obligatoria: "Drive y OneDrive NO son almacenamiento principal".*
