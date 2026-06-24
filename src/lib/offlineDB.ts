/**
 * offlineDB.ts — Base de datos local IndexedDB via Dexie (Sprint 22)
 *
 * Solo para datos operativos: Check In/Out, estado OT, evidencias, GPS, comentarios.
 * NO persiste: facturación, BI, CRM, admin, reportes.
 *
 * Zero Trust: cuando se sincroniza, el backend valida todo nuevamente.
 * Los datos offline son un "intento" — el backend es la fuente de verdad.
 */
import Dexie, { type Table } from 'dexie';

// ─── Tipos de operaciones offline ────────────────────────────────────────────

export type OfflineSyncStatus = 'pending' | 'syncing' | 'completed' | 'failed';

export type OfflineOperationType =
  | 'check_in'
  | 'check_out'
  | 'update_work_order_status'
  | 'add_work_log_comment'
  | 'upload_evidence'
  | 'update_gps_location'
  | 'update_operational_status';

export interface OfflineSyncItem {
  id?:          number;          // autoincrement PK
  operation:    OfflineOperationType;
  payload:      string;          // JSON.stringify del payload RPC
  status:       OfflineSyncStatus;
  retries:      number;
  maxRetries:   number;
  lastError:    string | null;
  createdAt:    number;          // Date.now()
  syncedAt:     number | null;
  workspaceId:  string;          // Para agrupar por workspace
  userId:       string;          // Para Zero Trust al sincronizar
}

export interface OfflineEvidence {
  id?:           number;
  workOrderId?:  string | null;
  orderId?:      string | null;
  fileType:      'image' | 'video' | 'audio' | 'pdf' | 'signature';
  fileName:      string;
  mimeType:      string;
  base64Data:    string;          // Datos del archivo en base64
  fileSizeBytes: number;
  description:   string | null;
  syncStatus:    OfflineSyncStatus;
  syncItemId?:   number | null;   // Referencia a OfflineSyncItem
  createdAt:     number;
  workspaceId:   string;
  userId:        string;
}

export interface OfflineGpsEvent {
  id?:           number;
  eventType:     'check_in' | 'check_out' | 'status_change' | 'manual_update';
  latitude:      number;
  longitude:     number;
  accuracy:      number;
  timestamp:     number;
  operationalStatus?: string;
  workOrderId?:  string | null;
  orderId?:      string | null;
  syncStatus:    OfflineSyncStatus;
  syncItemId?:   number | null;
  workspaceId:   string;
  userId:        string;
}

// ─── Schema de la base de datos ───────────────────────────────────────────────

class ShelwiOfflineDB extends Dexie {
  syncQueue!:      Table<OfflineSyncItem,  number>;
  evidences!:      Table<OfflineEvidence,  number>;
  gpsEvents!:      Table<OfflineGpsEvent,  number>;

  constructor() {
    super('shelwi_offline_v1');

    this.version(1).stores({
      // Cola de sincronización
      syncQueue: '++id, status, createdAt, workspaceId, userId, operation',

      // Evidencias capturadas offline
      evidences: '++id, syncStatus, workOrderId, orderId, workspaceId, userId, createdAt',

      // Eventos GPS capturados offline
      gpsEvents: '++id, syncStatus, eventType, workspaceId, userId, timestamp',
    });
  }
}

// Instancia singleton
export const offlineDB = new ShelwiOfflineDB();

// ─── API de sincronización ────────────────────────────────────────────────────

/** Encola una operación para sincronizar cuando haya conexión */
export async function enqueueOfflineOperation(
  operation: OfflineOperationType,
  payload: Record<string, unknown>,
  workspaceId: string,
  userId: string,
): Promise<number> {
  return offlineDB.syncQueue.add({
    operation,
    payload:     JSON.stringify(payload),
    status:      'pending',
    retries:     0,
    maxRetries:  3,
    lastError:   null,
    createdAt:   Date.now(),
    syncedAt:    null,
    workspaceId,
    userId,
  });
}

/** Guarda evidencia localmente para subir cuando haya conexión */
export async function saveEvidenceOffline(evidence: Omit<OfflineEvidence, 'id'>): Promise<number> {
  return offlineDB.evidences.add(evidence);
}

/** Guarda evento GPS localmente */
export async function saveGpsEventOffline(event: Omit<OfflineGpsEvent, 'id'>): Promise<number> {
  return offlineDB.gpsEvents.add(event);
}

/** Obtiene todas las operaciones pendientes de sincronizar */
export async function getPendingOperations(): Promise<OfflineSyncItem[]> {
  return offlineDB.syncQueue
    .where('status')
    .anyOf(['pending', 'failed'])
    .and(item => item.retries < item.maxRetries)
    .toArray();
}

/** Obtiene evidencias pendientes de subir */
export async function getPendingEvidences(): Promise<OfflineEvidence[]> {
  return offlineDB.evidences
    .where('syncStatus')
    .anyOf(['pending', 'failed'])
    .toArray();
}

/** Cuenta total de ítems pendientes */
export async function getPendingCount(): Promise<number> {
  const [ops, evs, gps] = await Promise.all([
    offlineDB.syncQueue.where('status').anyOf(['pending', 'failed']).count(),
    offlineDB.evidences.where('syncStatus').anyOf(['pending', 'failed']).count(),
    offlineDB.gpsEvents.where('syncStatus').anyOf(['pending', 'failed']).count(),
  ]);
  return ops + evs + gps;
}

/** Marca un ítem de la cola como completado */
export async function markSyncCompleted(id: number): Promise<void> {
  await offlineDB.syncQueue.update(id, { status: 'completed', syncedAt: Date.now() });
}

/** Marca un ítem como fallido con el error */
export async function markSyncFailed(id: number, error: string, retries: number): Promise<void> {
  const status: OfflineSyncStatus = retries >= 3 ? 'failed' : 'pending';
  await offlineDB.syncQueue.update(id, { status, lastError: error, retries });
}

/** Limpia ítems completados mayores a N días */
export async function cleanupCompletedItems(daysOld = 7): Promise<void> {
  const cutoff = Date.now() - daysOld * 86_400_000;
  await offlineDB.syncQueue
    .where('status').equals('completed')
    .and(item => (item.syncedAt ?? 0) < cutoff)
    .delete();
  await offlineDB.evidences
    .where('syncStatus').equals('completed')
    .and(ev => ev.createdAt < cutoff)
    .delete();
  await offlineDB.gpsEvents
    .where('syncStatus').equals('completed')
    .and(ev => ev.timestamp < cutoff)
    .delete();
}
