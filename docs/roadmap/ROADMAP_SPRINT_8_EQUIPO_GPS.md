# ROADMAP SPRINT 8 — EQUIPO + GPS

**Fecha inicio:** 2026-06-21  
**Objetivo:** Gestión de personal y ubicación operativa para empresas de campo.

---

## DECISIONES DE ARQUITECTURA (aprobadas)

| Decisión | Resolución |
|---|---|
| operational_status | Columna en `profiles` (O(1), sin JOINs) |
| phone | Columna en `profiles` |
| Consentimiento GPS | `gps_consent_at timestamptz` en `profiles` — obligatorio antes de check-in |
| Validación GPS | lat/lng range + accuracy ≤ 500m — rechazar si excede |
| Mapa | MapLibre GL + OpenStreetMap (sin costo variable, sin Google Maps) |
| GPS batería | NO `watchPosition()` — solo `getCurrentPosition()` one-shot |
| member_locations | UPSERT — una sola fila por usuario (última ubicación) |
| gps_events | Histórico completo: check_in/check_out/status_change/manual_update |
| Roles | employee → operario migrado. Nuevos: supervisor, comercial |
| Visibilidad mapa | owner/admin/supervisor: equipo completo. comercial/operario: solo sí mismo |

---

## FASE 1 — ROLES ✅ (Migración 0056)

- `profiles_role_check` constraint reemplazado: +supervisor, +comercial, +operario, -employee
- `UPDATE profiles SET role='operario' WHERE role='employee'` — migración automática
- `workspace_invitations.role` constraint actualizado
- `invite_team_member` RPC — acepta admin/supervisor/comercial/operario
- `update_team_member_role` RPC — acepta nuevos roles
- Helper `can_view_full_team(workspace_id)` — owner/admin/supervisor = true

---

## FASE 2 — GPS SCHEMA ✅ (Migración 0057)

### `profiles` nuevas columnas
- `phone text` — contacto del miembro
- `operational_status text` — off/disponible/en_ruta/en_sitio/finalizado (default 'off')
- `gps_consent_at timestamptz` — null = sin consentimiento

### `member_locations` — última ubicación conocida
- Una fila por usuario (UNIQUE workspace_id, user_id)
- Campos: latitude, longitude, accuracy_meters, source, order_id, work_order_id, recorded_at
- RLS: workspace isolation + rol (comercial/operario solo ven la propia)

### `gps_events` — histórico
- event_type: check_in/check_out/status_change/manual_update
- Campos: lat/lng, accuracy, operational_status, order_id, work_order_id, metadata
- RLS: workspace isolation + rol

### Helper `validate_gps_coords(lat, lng, accuracy)` — inmutable, reutilizable

---

## FASE 3 — GPS RPCs ✅ (Migración 0058) — 8 RPCs Zero Trust

| RPC | Descripción | Validaciones |
|---|---|---|
| `grant_gps_consent()` | Usuario acepta uso de GPS | JWT + workspace |
| `record_check_in(lat, lng, accuracy?, order_id?, wo_id?)` | Check In | JWT + consent + gps_enabled + accuracy≤500m + workspace |
| `record_check_out(lat, lng, accuracy?, order_id?, wo_id?)` | Check Out | ídem |
| `update_operational_status(status)` | Cambio de estado (sin GPS) | JWT + gps_enabled |
| `update_location_manual(lat, lng, accuracy?)` | Ubicación manual | JWT + consent + gps_enabled |
| `get_team_map(workspace_id)` | Mapa del equipo | owner/admin/supervisor únicamente |
| `get_member_detail(user_id, workspace_id)` | Detalle + historial GPS | role-based: operario solo ve el propio |
| `get_operational_dashboard(workspace_id)` | Métricas operativas | owner/admin/supervisor únicamente |

---

## FASE 4 — MAPLIBRE ✅

- `maplibre-gl ^5.24.0` instalado
- Tiles gratuitos de OpenStreetMap (`tile.openstreetmap.org`)
- Sin API key, sin costo variable
- Compatible con Sprint 9+ (rutas, geofencing)

---

## FASE 5 — TYPESCRIPT ✅

| Fix | Detalle |
|---|---|
| `ProfileRow` | +phone, +operational_status, +gps_consent_at, roles actualizados |
| `UserRole` type | owner/admin/supervisor/comercial/operario/super_admin/support_admin |
| `OperationalStatus` type | off/disponible/en_ruta/en_sitio/finalizado |
| `WorkLogEventType` | +evidence_uploaded, +evidence_deleted (fix bug Sprint 7) |
| `MemberLocationRow` | Tipo nuevo |
| `GpsEventRow` | Tipo nuevo |
| `TeamMapMember` | Interface nueva |
| `OperationalDashboard` | Interface nueva |
| Database.Functions | 9 RPCs GPS tipadas |
| Database.Tables | member_locations, gps_events tipadas |
| `services/team.ts` | InviteTeamMemberInput.role actualizado |
| `services/gps.ts` | Servicio GPS completo |
| `hooks/useGPS.ts` | Todos los hooks de React Query |

---

## FASE 6 — UI ✅ (Mobile-first)

### Actualizados
- `TeamMobile.tsx` — ROLE_META con 7 roles, tabs Todos/Admins/Operativos, selector 4 roles, ActionDrawer actualizado
- `Team.tsx` — ROLE_LABELS con 7 roles, selector 4 roles en invitar y tabla
- `MobileDashboard.tsx` — +OperationalDashboardWidget

### Nuevos
- `CheckInOutButton.tsx` — Botón GPS para operarios/supervisores. Modal de consentimiento al primer uso. One-shot `getCurrentPosition()`.
- `OperationalMap.tsx` — Mapa MapLibre con marcadores del equipo. Tiles OSM gratuitos. Actualización manual (no continua).
- `MemberDetailSheet.tsx` — Detalle de miembro: contacto, ubicación, OTs activas, historial GPS.
- `OperationalStatusSelector.tsx` — Cambio de estado operativo sin GPS.
- `OperationalDashboardWidget.tsx` — Widget en Dashboard: en campo, check-ins hoy, OTs activas.

---

## CONSUMO DE BATERÍA — DOCUMENTADO

| Qué usa GPS | Cómo |
|---|---|
| Check In | `getCurrentPosition()` — one-shot |
| Check Out | `getCurrentPosition()` — one-shot |
| Actualización manual | `getCurrentPosition()` — one-shot |
| Estado operativo | Sin GPS (solo texto) |

**Prohibido en toda la app:**
- `navigator.geolocation.watchPosition()`
- Polling GPS con `setInterval`
- Background location

---

## INSTRUCCIONES DE DEPLOYMENT

```sql
-- Aplicar en orden en Supabase SQL Editor:
0056_roles_expansion.sql
0057_gps_schema.sql
0058_gps_rpc.sql
```

---

## PRUEBAS DE SEGURIDAD

| Test | Resultado |
|---|---|
| Sin consentimiento → check_in → bloqueado | ✅ RPC verifica gps_consent_at IS NOT NULL |
| Con consentimiento → check_in | ✅ Modal de consentimiento + grant_gps_consent() |
| accuracy 800m → rechazado | ✅ validate_gps_coords() rechaza > 500m |
| accuracy 20m → aceptado | ✅ Pasa validación |
| Workspace cruzado → bloqueado | ✅ Todos los RPCs validan workspace membership |
| Operario ve mapa completo → bloqueado | ✅ can_view_full_team() + RLS en member_locations |
| Owner visualiza equipo | ✅ get_team_map() retorna todos |
| Check Out → gps_events + member_locations | ✅ UPSERT + INSERT historial |
| FREE → GPS bloqueado | ✅ check_feature_access('gps_enabled') |
| PRO → GPS bloqueado | ✅ gps_enabled=false para PRO |

---

## RIESGOS RESIDUALES

| Riesgo | Severidad | Plan |
|---|---|---|
| Spoofing GPS | Bajo | Documentado. Sin PostGIS, imposible verificar plausibilidad. Sprint 9 evalúa |
| OSM tile limits | Bajo | OpenStreetMap tolera uso moderado. Para producción alta: migrar a Stadia Maps (gratuito hasta 200k tiles/mes) |
| MapLibre bundle (+1.6MB) | Bajo | Carga lazy del mapa en Sprint 9 con code splitting |
| Mapa desktop no implementado | Bajo | OperationalMap funciona en desktop, falta vista dedicada en Team desktop |
| `employees.length` en TeamMobile | Resuelto | Variable eliminada, reemplazada por filtro en tiempo real |
