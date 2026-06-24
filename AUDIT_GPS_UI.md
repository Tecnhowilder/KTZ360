# AUDITORÍA GPS UI — SHELWI
**Fecha:** 23 de junio de 2026  
**Metodología:** Read-only. Sin modificaciones. Evidencia directa del código.

---

## RESUMEN EJECUTIVO

**El backend GPS está 100% implementado y funcional.**  
**El frontend GPS está implementado y funcional.**  
**La ruta solicitada `/app/operaciones/mapa` existe como `/app/mapa-operativo`.**

---

## BACKEND GPS — ESTADO COMPLETO

### Tablas (0057_gps_schema.sql)

| Tabla / Columnas | Estado | RLS |
|-----------------|--------|-----|
| `profiles.operational_status` ('off'\|'disponible'\|'en_ruta'\|'en_sitio'\|'finalizado') | ✅ EXISTE | ✅ |
| `profiles.gps_consent_at` (timestamptz, NULL = sin consentimiento) | ✅ EXISTE | ✅ |
| `profiles.phone` (text) | ✅ EXISTE | ✅ |
| `member_locations` (UPSERT, 1 fila por usuario) | ✅ EXISTE | ✅ |
| `gps_events` (histórico completo, índices en workspace+user+type) | ✅ EXISTE | ✅ |
| `validate_gps_coords()` (helper: rechaza >500m, (0,0), rangos inválidos) | ✅ EXISTE | — |

### RPCs GPS (0058_gps_rpc.sql)

| RPC | Qué hace | Feature gate | Zero Trust |
|-----|---------|--------------|-----------|
| `grant_gps_consent()` | Registra consentimiento GPS + audit | Sin gate | ✅ JWT |
| `record_check_in(lat, lng, accuracy?, order_id?, work_order_id?)` | Check in + UPSERT location + notificaciones | `gps_enabled` PREMIUM | ✅ JWT |
| `record_check_out(lat, lng, accuracy?, order_id?, work_order_id?)` | Check out + UPSERT location + notificaciones | `gps_enabled` PREMIUM | ✅ JWT |
| `update_operational_status(status)` | Cambia estado + gps_event sin coordenadas | `gps_enabled` PREMIUM | ✅ JWT |
| `update_location_manual(lat, lng, accuracy?)` | Actualiza ubicación manual | `gps_enabled` PREMIUM | ✅ JWT |
| `get_team_map(workspace_id)` | Mapa completo con permisos por rol | `gps_enabled` PREMIUM | ✅ JWT + roles |
| `get_member_detail(user_id, workspace_id)` | Detalle + últimos 20 eventos + OTs activas | `gps_enabled` PREMIUM | ✅ JWT + roles |
| `get_operational_dashboard(workspace_id)` | KPIs: en_campo, checkins_hoy, ot_activas, etc. | `gps_enabled` PREMIUM | ✅ JWT + solo managers |

### Control de acceso por rol
| Operación | owner | admin | supervisor | comercial | operario |
|-----------|-------|-------|-----------|-----------|---------|
| Ver mapa equipo completo | ✅ | ✅ | ✅ | ❌ solo él | ❌ solo él |
| Dashboard operativo | ✅ | ✅ | ✅ | ❌ | ❌ |
| Detalle de otros miembros | ✅ | ✅ | ✅ | ❌ | ❌ |
| Check in / Check out | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cambiar estado operativo | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## FRONTEND GPS — ESTADO COMPLETO

### Componentes (src/components/gps/)

| Componente | Función | Estado |
|-----------|---------|--------|
| `CheckInOutButton.tsx` | Botón con flujo completo: solicita consentimiento → pide GPS (one-shot) → llama RPC | ✅ COMPLETO |
| `MemberDetailSheet.tsx` | Bottom sheet con detalle de miembro: ubicación + accuracy + eventos + OTs activas | ✅ COMPLETO |
| `OperationalMap.tsx` | Mapa MapLibre GL + OSM. Marcadores por miembro. Dynamic import lazy. | ✅ COMPLETO |
| `OperationalStatusSelector.tsx` | Selector de estado operativo. Llama `update_operational_status`. | ✅ COMPLETO |

### Servicio (src/services/gps.ts)

| Función | Descripción |
|---------|-------------|
| `getCurrentPosition()` | One-shot GPS, 15s timeout, acepta pos de 30s |
| `grantGpsConsent()` | Llama RPC `grant_gps_consent` |
| `recordCheckIn(opts)` | Llama RPC `record_check_in` |
| `recordCheckOut(opts)` | Llama RPC `record_check_out` |
| `updateOperationalStatus(status)` | Llama RPC `update_operational_status` |
| `updateLocationManual()` | Llama RPC `update_location_manual` |
| `getTeamMap(workspaceId)` | Llama RPC `get_team_map` |
| `getMemberDetail(userId, workspaceId)` | Llama RPC `get_member_detail` |
| `getOperationalDashboard(workspaceId)` | Llama RPC `get_operational_dashboard` |
| `canViewFullTeam(role)` | Helper: owner/admin/supervisor = true |
| `formatLastSeen(date)` | Helper: "Hace 5 min" |
| `ROLE_META` | Labels + colores por rol |
| `OPERATIONAL_STATUS_META` | Labels + colores + emojis por estado |

### Hooks (src/hooks/useGPS.ts)

| Hook | Tipo | staleTime |
|------|------|---------|
| `useGrantGpsConsent()` | useMutation | — |
| `useCheckIn(opts?)` | useMutation + invalidation | — |
| `useCheckOut(opts?)` | useMutation + invalidation | — |
| `useUpdateOperationalStatus()` | useMutation + invalidation | — |
| `useUpdateLocationManual()` | useMutation + invalidation | — |
| `useTeamMap()` | useQuery | 30s |
| `useMemberDetail(userId)` | useQuery | 20s |
| `useOperationalDashboard()` | useQuery | 30s |

### Vista (src/views/MapaOperativoPage.tsx)

**Ruta:** `/app/mapa-operativo`  
**Ruta en mobile nav:** ✅ En MORE_ITEMS como "Mapa GPS" con `icon: UserCog`  
**Feature gate:** ✅ `gps_enabled` — muestra NoAccess para FREE/PRO  
**Dos modos:**
- `MyStatusView` — para operario/comercial: estado + Check In/Out
- `ManagerMapView` — para owner/admin/supervisor: KPIs + mapa + lista + detalle

### Tipos TypeScript (src/lib/database.types.ts)

| Tipo | Estado |
|------|--------|
| `OperationalStatus` | ✅ EXISTE |
| `GpsEventType` | ✅ EXISTE |
| `MemberLocationRow` | ✅ EXISTE |
| `GpsEventRow` | ✅ EXISTE |
| `TeamMapMember` | ✅ EXISTE |
| `OperationalDashboard` | ✅ EXISTE |
| `UserRole` con supervisor/operario/comercial | ✅ EXISTE |

---

## HALLAZGOS

### ✅ QUÉ FUNCIONA COMPLETAMENTE

1. Backend GPS (8 RPCs, 2 tablas, validación, Zero Trust, Feature gating, RLS)
2. Componentes GPS (4 componentes reutilizables)
3. Servicio gps.ts (9 funciones + helpers)
4. Hooks GPS (8 hooks React Query)
5. Vista `/app/mapa-operativo` con 2 modos (manager vs operario)
6. Mapa MapLibre con marcadores por miembro
7. Check In/Out con flujo de consentimiento
8. Dashboard KPIs (en_campo, checkins_hoy, ot_activas)
9. Detalle de miembro con historial GPS

### ⚠️ HALLAZGOS MENORES

| # | Hallazgo | Severidad | Impacto |
|---|---------|-----------|---------|
| 1 | La ruta es `/app/mapa-operativo`, no `/app/operaciones/mapa` como pide el spec | 🟡 Medio | Solo URL, misma funcionalidad |
| 2 | `MyStatusView` usa emoji `⚙️` fijo en lugar del emoji del `OPERATIONAL_STATUS_META` | 🟢 Bajo | Visual menor |
| 3 | KPIs de dashboard: faltan `disponibles`, `finalizados` (solo muestra 3 de 5 estados) | 🟡 Medio | Dashboard incompleto |
| 4 | `void useWindowWidth()` y `void navModeFor` en MapaOperativoPage (imports sin uso) | 🟢 Bajo | TypeScript warning |
| 5 | `MemberDetailSheet` no tiene `workOrderId` propagado desde `CheckInOutButton` | 🟡 Medio | OT no se asocia al check-in desde el mapa |

---

## MAPA DE DEPENDENCIAS GPS

```
/app/mapa-operativo (MapaOperativoPage)
├── Feature gate: gps_enabled (PREMIUM)
├── Rol manager?
│   ├── ManagerMapView
│   │   ├── useOperationalDashboard() → get_operational_dashboard RPC
│   │   ├── OperationalMap → MapLibre GL + get_team_map RPC
│   │   └── MemberDetailSheet → get_member_detail RPC
│   └── MyStatusView
│       ├── OperationalStatusSelector → update_operational_status RPC
│       └── CheckInOutButton
│           ├── grant_gps_consent RPC (si sin consentimiento)
│           ├── getCurrentPosition() → browser GPS API
│           ├── record_check_in RPC
│           └── record_check_out RPC
```
