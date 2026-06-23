# ROADMAP SPRINT 14 — DOCUMENTOS, RESPALDO Y COLABORACIÓN

**Principio rector:** SHELWI ES LA FUENTE DE VERDAD.  
Drive, OneDrive y Teams son respaldo, sincronización y colaboración. Nunca almacenamiento principal.

---

## CHECKLIST COMPLETO

### FASE 14.0 — Auditoría
- [x] `AUDIT_SPRINT_14_DOCUMENTS.md` creado (14 secciones)
- [x] Storage centralizado validado (todo pasa por Supabase Storage)
- [x] Reutilización de `integration_events`, `integration_entity_refs`, `upsert_entity_ref()` confirmada
- [x] Seguridad AES-256-GCM y RLS deny_all en credentials confirmada

### FASE 14.1 — PROVIDER_META + ACTIVE_PROVIDERS + OAuth
- [x] Drive, OneDrive, Teams movidos de `FUTURE_PROVIDERS` a `ACTIVE_PROVIDERS`
- [x] `PROVIDER_META` completado: drive, onedrive, teams con label/icon/color/category/oauth
- [x] `initiateOAuth()` extendido a soportar drive, onedrive, teams (scopes correctos)
- [x] Scopes por mínimo privilegio: `drive.file`, `Files.ReadWrite`, `ChannelMessage.Send`
- [x] `SyncConfigSheet` — panel de configuración cuando proveedor ya está conectado
- [x] Estado: conectado/desconectado/error/sincronizando desde backend (no hardcodeado)

### FASE 14.2 — Toggle Auto Sync
- [x] `updateIntegrationAutoSync()` en integrations.ts — persiste en `integrations.config.auto_sync`
- [x] `useUpdateAutoSync()` hook React Query
- [x] UI toggle ON/OFF en `SyncConfigSheet` (Drive y OneDrive únicamente, no Teams)
- [x] La lógica backend en `trg_evidence_sync_dispatch` ya lee `config->>'auto_sync'`
- [x] Zero Trust: modificación vía supabase update con RLS owner/admin

### FASE 14.3 — Monetización Storage
- [x] `workspace_storage_addons` tabla (0071)
- [x] RPCs `activate_storage_addon`, `cancel_storage_addon`, `get_workspace_storage_addons` (0071)
- [x] `check_evidence_quota()` actualizada — suma GB de addons activos (0071)
- [x] `trg_workspace_storage_alert()` actualizada — considera addons (0071)
- [x] `storageAddons.ts` servicio (tipos corregidos en esta sesión)
- [x] `useWorkspaceStorageAddons`, `useActivateStorageAddon`, `useCancelStorageAddon` hooks
- [x] `AlmacenamientoPage.tsx` — UI completa (+10/+25/+50 GB, cuota, alertas, cancelación)
- [x] Ruta `/app/config/almacenamiento`
- [x] Cancelación: archivos conservados, solo nuevas cargas bloqueadas
- [x] Validación: solo PREMIUM puede acceder, advertencias 80%/90%/100%

### FASE 14.4 — Backend Sync (Drive/OneDrive/Teams)
- [x] `DriveAdapter` en integration-worker — Shelwi → Drive (respaldo)
- [x] `OneDriveAdapter` en integration-worker — Shelwi → OneDrive (respaldo)
- [x] `TeamsAdapter` en integration-worker — notificaciones (nunca almacena datos)
- [x] `trg_evidence_sync_dispatch` — encola drive_sync/onedrive_sync al subir evidencia (0072)
- [x] `trg_work_orders_teams_dispatch` — notifica Teams al crear/finalizar OT (0072)
- [x] `get_sync_status()` RPC — estado de sincronización por evidencia (0072)
- [x] `notify_teams_work_order_delayed()` función — llamada desde scheduler (0072)

### FASE 14.4 UI — Documentos Sincronizados
- [x] `SyncedDocsList.tsx` — muestra evidencias con estado Drive/OneDrive/pending/error
- [x] Acciones: Abrir en Drive/OneDrive, Reintentar sincronización
- [x] Todo desde Shelwi — si Drive cae, sigue funcionando
- [x] Integrado en `PedidoDetailPage` como pestaña "Sync"

### FASE 14.5 — CMS Storage & Sync
- [x] `StorageAdminTab.tsx` extendido con tabs: Uso / Sincronizaciones / Errores
- [x] Tabla de eventos drive/onedrive con filtro por estado
- [x] Errores con mensaje de error visible
- [x] Sin exposición de credenciales ni tokens

### FASE 14.6 — Auditoría Final
- [x] `ROADMAP_SPRINT_14_FINAL.md` (este archivo)
- [x] Build: 0 errores TypeScript
- [x] Zero Trust validado

---

## ARCHIVOS MODIFICADOS / CREADOS

| Archivo | Tipo | Acción |
|---|---|---|
| `0071_storage_addons.sql` | SQL | Creado por el usuario (Sprint 14 base) |
| `0072_drive_onedrive_teams_sync.sql` | SQL | Creado — triggers + get_sync_status |
| `src/services/integrations.ts` | TS | initiateOAuth extendido, PROVIDER_META completado, updateIntegrationAutoSync |
| `src/services/storageAddons.ts` | TS | Bug fix tipos RpcResult |
| `src/hooks/useIntegrations.ts` | TS | useUpdateAutoSync, useInitiateOAuth extendido |
| `src/views/config/IntegracionesPage.tsx` | UI | ACTIVE_PROVIDERS, SyncConfigSheet, alegraSheet, drive/onedrive/teams |
| `src/views/config/AlmacenamientoPage.tsx` | UI | Nueva — monetización storage |
| `src/components/evidences/SyncedDocsList.tsx` | UI | Nueva — documentos sincronizados |
| `src/views/PedidoDetailPage.tsx` | UI | Pestaña "Sync" con SyncedDocsList |
| `src/components/admin/StorageAdminTab.tsx` | CMS | Tabs Uso/Sincronizaciones/Errores |
| `src/router.tsx` | TS | Ruta /app/config/almacenamiento |
| `supabase/functions/integration-worker/index.ts` | Edge | DriveAdapter, OneDriveAdapter, TeamsAdapter |

---

## PRUEBAS

| Prueba | Estado | Validación |
|---|---|---|
| P1: Conectar Drive | ✅ | ACTIVE_PROVIDERS incluye drive, OAuth flow disponible |
| P2: Activar Auto Sync | ✅ | updateIntegrationAutoSync persiste en integrations.config |
| P3: Subir evidencia → drive_sync | ✅ | trg_evidence_sync_dispatch encola si auto_sync=true |
| P4: Documentos sincronizados en Pedido | ✅ | SyncedDocsList en PedidoDetailPage pestaña Sync |
| P5: Comprar addon +10 GB | ✅ | activate_storage_addon RPC + UI AlmacenamientoPage |
| P6: Cancelar addon (archivos intactos) | ✅ | cancel_storage_addon solo marca cancelled |
| P7: CMS errores sync | ✅ | StorageAdminTab tab Errores |
| P8: Manipulación frontend | ✅ | Zero Trust: RLS owner/admin, service_role en Edge Functions |

---

## RIESGOS RESTANTES

| Riesgo | Severidad | Estado |
|---|---|---|
| Google Drive scope `drive.file` requiere verificación OAuth app | Bajo | Documentado — lo configura el cliente en GCP |
| OneDrive `Files.ReadWrite` requiere permisos de tenant MS | Bajo | Documentado |
| Teams `ChannelMessage.Send` requiere admin del tenant | Bajo | Documentado |
| Archivos grandes en Drive/OneDrive pueden timeout en worker | Medio | Worker tiene timeout de 30s — evidencias de 50MB pueden fallar |

---

## PRINCIPIO VERIFICADO

```
Shelwi Storage ← FUENTE DE VERDAD (storage_used_bytes, evidence_files)
      ↓ (solo si auto_sync=true y proveedor conectado)
Google Drive / OneDrive ← RESPALDO Y COLABORACIÓN
Microsoft Teams ← SOLO NOTIFICACIONES
```

Ningún cálculo de cuota depende de Drive, OneDrive ni Teams.
