# OFFLINE ARCHITECTURE REPORT — SHELWI
**Fecha:** 23 de junio de 2026  
**Tecnología:** Dexie.js 4.4.4 (IndexedDB wrapper)

---

## QUÉ SE PERSISTE OFFLINE

### ✅ OPERATIVO (sí offline)
| Operación | Tabla Dexie | Sincronización |
|-----------|------------|----------------|
| Check In | `syncQueue` (op: check_in) | Al recuperar conexión |
| Check Out | `syncQueue` (op: check_out) | Al recuperar conexión |
| Cambiar estado OT | `syncQueue` (op: update_work_order_status) | Al recuperar conexión |
| Agregar comentario bitácora | `syncQueue` (op: add_work_log_comment) | Al recuperar conexión |
| Evidencias (foto, video, firma) | `evidences` (base64) | Upload a Storage al reconectar |
| GPS location manual | `syncQueue` (op: update_gps_location) | Al recuperar conexión |
| Estado operativo (GPS) | `syncQueue` (op: update_operational_status) | Al recuperar conexión |

### ❌ NO OFFLINE (requiere conexión)
- Facturación / MercadoPago / DIAN
- BI / Reportes / Dashboards
- CRM / Pipeline
- Admin panel
- Integraciones (Calendar, WhatsApp)
- Configuración / Planes

---

## SCHEMA INDEXEDDB (src/lib/offlineDB.ts)

```
Database: shelwi_offline_v1

Table: syncQueue
  ++id (PK autoincrement)
  operation    TEXT   (check_in | check_out | update_work_order_status | ...)
  payload      TEXT   (JSON del payload RPC)
  status       TEXT   (pending | syncing | completed | failed)
  retries      INT    (0-3)
  maxRetries   INT    (3 default)
  lastError    TEXT   (null si OK)
  createdAt    INT    (Date.now())
  syncedAt     INT    (null si no sync aún)
  workspaceId  TEXT   (para agrupar)
  userId       TEXT   (para Zero Trust al re-validar)

Table: evidences
  ++id (PK)
  workOrderId  TEXT   (nullable)
  orderId      TEXT   (nullable)
  fileType     TEXT   (image | video | audio | pdf | signature)
  fileName     TEXT
  mimeType     TEXT
  base64Data   TEXT   (datos del archivo)
  fileSizeBytes INT
  description  TEXT
  syncStatus   TEXT   (pending | syncing | completed | failed)
  syncItemId   INT    (referencia a syncQueue, nullable)
  createdAt    INT
  workspaceId  TEXT
  userId       TEXT

Table: gpsEvents
  ++id (PK)
  eventType    TEXT   (check_in | check_out | status_change | manual_update)
  latitude     REAL
  longitude    REAL
  accuracy     REAL
  timestamp    INT
  operationalStatus TEXT (nullable)
  workOrderId  TEXT   (nullable)
  orderId      TEXT   (nullable)
  syncStatus   TEXT
  syncItemId   INT
  workspaceId  TEXT
  userId       TEXT
```

---

## FLUJO OFFLINE → SYNC

```
1. Usuario hace acción (Check In, foto, etc.)
        ↓
2. offlineDB.syncQueue.add() / offlineDB.evidences.add()
        ↓
3. UI muestra: "Guardado localmente"
        ↓
[SIN CONEXIÓN — datos en IndexedDB]
        ↓
4. useNetworkStatus detecta "online"
        ↓
5. runSync() automáticamente:
   a. getPendingOperations()
   b. Para cada op: RPC → backend valida → markSyncCompleted()
   c. getPendingEvidences()
   d. Para cada evidencia: upload Storage → register_evidence_file RPC → marcada completed
        ↓
6. cleanupCompletedItems(7) — elimina ítems >7 días completados
```

---

## ZERO TRUST EN SYNC

- El `userId` y `workspaceId` se guardan localmente pero el backend los re-valida
- El backend usa `auth.uid()` del JWT (nunca el userId del payload offline)
- Si el JWT expiró, el sync falla hasta que el usuario re-autentique
- Las evidencias se validan en `register_evidence_file` RPC igual que en online

---

## NETWORK BANNER (src/components/ui/NetworkBanner.tsx)

Muestra automáticamente cuando:
- `quality === 'offline'` → "Sin conexión — los cambios se guardarán localmente"
- `quality === 'poor'` → "Conexión lenta — sincronizando en segundo plano"
- `pendingCount > 0 && online` → "N operaciones pendientes de sincronizar" + botón Sincronizar
