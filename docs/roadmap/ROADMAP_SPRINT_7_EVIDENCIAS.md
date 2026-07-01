# ROADMAP SPRINT 7 — EVIDENCIAS

**Fecha inicio:** 2026-06-21  
**Objetivo:** Sistema completo de evidencias para Pedidos y Órdenes de Trabajo. PREMIUM only.

---

## DECISIONES DE ARQUITECTURA (aprobadas)

| Decisión | Resolución |
|---|---|
| Feature flag | `storage_enabled` (existente). Sin `evidence_enabled` nuevo |
| Bucket | Nuevo bucket `evidences` (privado, feature-gated) |
| Tracking cuota | `storage_used_bytes` en `workspaces` (O(1), trigger actualiza) |
| Compresión | Híbrido: Canvas API cliente + validación de tipo/tamaño en backend |
| Path structure | `{workspace_id}/{order\|work_order}/{entity_id}/{uuid}.{ext}` |
| Cuota PREMIUM | 5 GB (`plan_limits.max_storage_gb = 5`) — existía desde Sprint 1 |
| Bug corregido | `PlanLimitsRow` TypeScript no tenía `max_storage_gb` ni `max_catalog_items` — **corregido** |
| `WorkspaceRow` TypeScript | No tenía `storage_used_bytes` — **corregido** |

---

## FASE 1 — BACKEND ✅

### Migración 0053 — Schema
- `storage_used_bytes bigint` en tabla `workspaces` (O(1) tracking)
- Bucket `evidences`: privado, 50 MB/archivo, MIME whitelist (imágenes/video/audio/PDF/SVG)
- RLS bucket `evidences`: workspace isolation + `storage_enabled` feature gating en SELECT/INSERT/DELETE
- Tabla `evidence_files`: id, workspace_id, order_id, work_order_id, uploaded_by, file_name, file_size, mime_type, storage_path (unique), file_type, caption, is_signature, duration_sec, thumbnail_path, metadata, deleted_at
- Constraint: al menos `order_id` o `work_order_id` presentes
- Función `mime_to_file_type()` — helper inmutable
- Función `check_evidence_quota()` — verifica cuota actual + adicional

### Migración 0054 — RPCs (5 RPCs Zero Trust)
| RPC | Descripción | Validaciones |
|---|---|---|
| `check_evidence_upload_allowed()` | Pre-upload: devuelve path autorizado | JWT + workspace + storage_enabled + cuota + MIME + 50MB |
| `register_evidence_file()` | Post-upload: registra + actualiza cuota | Double-check Zero Trust + re-valida cuota |
| `delete_evidence_file()` | Soft-delete + decrementa cuota | JWT + workspace + owner/admin check |
| `get_evidence_gallery()` | Lista evidencias de un pedido/OT | JWT + workspace + storage_enabled |
| `get_storage_usage()` | Dashboard de almacenamiento | JWT + workspace |

### Migración 0055 — Triggers
- `work_logs` `event_type` ampliado: +`evidence_uploaded`, +`evidence_deleted`
- Trigger `trg_workspaces_storage_floor` — previene `storage_used_bytes < 0`
- Trigger `trg_evidence_notify_on_upload` — notificación al owner (max 1/hora)
- Trigger `trg_workspace_storage_alert` — alerta al 80%, 90%, 100% de cuota
- Función `recalculate_workspace_storage()` — corrección de drift mensual (service_role)

---

## FASE 2 — TYPESCRIPT FIXES ✅

| Fix | Antes | Después |
|---|---|---|
| `PlanLimitsRow` | Sin `max_storage_gb`, sin `max_catalog_items` | Ambos campos presentes |
| `WorkspaceRow` | Sin `storage_used_bytes` | Campo presente |
| Nuevos tipos | — | `EvidenceFileType`, `EvidenceFileRow`, `EvidenceFileWithUploader`, `StorageUsage` |
| Database.Functions | — | 8 RPCs tipadas de evidencias |
| Database.Tables | — | `evidence_files` table tipada |

---

## FASE 3 — SERVICIO Y HOOKS ✅

### `src/services/evidences.ts`
- `compressImage()` — Canvas API, max 1920px, JPEG 82% (optimización, no seguridad)
- `isCompressibleImage()` — detecta imágenes comprimibles
- `uploadEvidence()` — flujo completo: comprimir → check_backend → upload → register
- `deleteEvidence()` — soft-delete en DB + limpieza storage
- `getEvidenceGallery()` — galería con signed URLs
- `getSignedUrl()` / `getSignedUrls()` — URLs firmadas (3600s)
- `getStorageUsage()` — dashboard de almacenamiento
- `formatBytes()` — formato legible (B, KB, MB, GB)
- `mimeToFileType()` — helper MIME → category

### `src/hooks/useEvidences.ts`
- `useEvidenceGallery(orderId?, workOrderId?, fileType?)` — React Query
- `useUploadEvidence({orderId?, workOrderId?})` — mutación con toast
- `useDeleteEvidence()` — mutación con confirmación
- `useStorageUsage()` — React Query (1min stale)

---

## FASE 4 — COMPONENTES UI ✅ (Mobile-first 390/430px)

### `EvidenceGallery.tsx`
- Grid 3×N de miniaturas
- Signed URLs automáticas al montar
- Visor fullscreen: imagen, video (player), audio (player), PDF (iframe), firma
- Botón descargar + eliminar con confirmación
- Skeleton loading, estado vacío, error state

### `EvidenceUploader.tsx`
- Botón "Subir evidencia" → sheet con 5 opciones (Foto, Video, Audio, PDF, Firma)
- Upload con `capture="environment"` en móvil para fotos directas
- Preview antes de subir con campo de caption
- Integra `SignatureCapture` para firmas
- Feature gate: si FREE/PRO → UpgradeModal con bullets PREMIUM

### `SignatureCapture.tsx`
- Canvas HTML5 con soporte touch y mouse
- Líneas suaves con `quadraticCurveTo`
- DPR scaling para pantallas Retina
- Exporta como PNG File listo para upload

### `StorageWidget.tsx`
- Barra de uso con color dinámico (azul→naranja→rojo)
- Iconos por tipo de archivo
- Alerta cuando ≥90% de cuota
- FREE/PRO → upsell card

---

## FASE 5 — INTEGRACIÓN ✅

| Vista | Cambio |
|---|---|
| `PedidoDetailPage.tsx` | Nueva pestaña "Evidencias" con Gallery + Uploader |
| `OTDetailPage.tsx` | Nueva pestaña "Evidencias" con Gallery + Uploader |
| `MobileDashboard.tsx` | StorageWidget insertado (después de CrmMetricsCard) |

---

## FLUJO COMPLETO (Zero Trust)

```
Usuario selecciona archivo
↓
Frontend: compressImage() si es imagen
↓
RPC check_evidence_upload_allowed()
  ✓ JWT + workspace membership
  ✓ storage_enabled (PREMIUM)
  ✓ cuota (storage_used_bytes + file_size ≤ max_storage_gb * 1GB)
  ✓ MIME whitelist
  ✓ file_size ≤ 50MB
  → devuelve upload_path autorizado
↓
supabase.storage.from('evidences').upload(upload_path, file)
  RLS enforced: workspace isolation + storage_enabled
↓
RPC register_evidence_file()
  ✓ Double-check Zero Trust
  ✓ Re-valida cuota (race condition)
  ✓ Valida path pertenece al workspace
  → INSERT evidence_files
  → UPDATE workspaces.storage_used_bytes += file_size
  → INSERT work_logs (event_type: 'evidence_uploaded')
↓
Trigger: notificación al owner si primera carga del día
Trigger: alerta si cuota ≥ 80%
```

---

## INSTRUCCIONES DE DEPLOYMENT

```sql
-- Aplicar en Supabase SQL Editor (en orden):
0053_evidences_schema.sql
0054_evidences_rpc.sql
0055_evidences_triggers.sql
```

---

## PRUEBAS DE SEGURIDAD

| Test | Resultado |
|---|---|
| FREE → subir evidencia → bloqueado | ✅ RLS + RPC rechaza |
| PRO → subir evidencia → bloqueado | ✅ storage_enabled=false para PRO |
| PREMIUM → subir imagen | ✅ Flujo completo |
| PREMIUM → subir PDF | ✅ MIME validado |
| PREMIUM → firma digital | ✅ SignatureCapture + is_signature=true |
| Exceder 5 GB → bloqueado | ✅ check_evidence_quota() en RPC |
| Acceso archivo otro workspace | ✅ RLS storage path prefix check |
| Manipular storage_path manualmente | ✅ Validado en register_evidence_file() |
| MIME spoofing (extensión vs mime) | ✅ mime_to_file_type() valida MIME real |

---

## RIESGOS RESTANTES

| Riesgo | Severidad | Plan |
|---|---|---|
| Race condition cuota (upload paralelo masivo) | Bajo | register_evidence_file re-valida; el exceso mínimo es recuperable con recalculate_storage |
| Archivos huérfanos (upload ok, register falla) | Bajo | uploadEvidence() limpia automáticamente; cron cleanup opcional |
| Compresión video no implementada | Bajo | Documentado — Sprint 8+ con Edge Function de transcodificación |
| Thumbnails videos/audios | Bajo | Sprint 8 — generación de thumbnails con Edge Function |
| Desktop view sin implementar | Bajo | PedidoDetailPage y OTDetailPage son mobile-first; desktop heredado |
