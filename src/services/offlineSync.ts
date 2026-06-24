/**
 * offlineSync.ts — Motor de sincronización offline → backend (Sprint 22)
 *
 * Procesa la cola de operaciones pendientes cuando hay conexión.
 * Zero Trust: todas las operaciones son re-validadas por el backend.
 * El sync solo envía los datos — el backend decide si son válidos.
 */
import { supabase } from '../lib/supabaseClient';
import {
  offlineDB,
  getPendingOperations,
  getPendingEvidences,
  markSyncCompleted,
  markSyncFailed,
  cleanupCompletedItems,
  type OfflineSyncItem,
  type OfflineEvidence,
} from '../lib/offlineDB';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase as any);

// ─── Mapa de operaciones → RPCs ───────────────────────────────────────────────

const OPERATION_RPC_MAP: Record<string, string> = {
  check_in:                   'record_check_in',
  check_out:                  'record_check_out',
  update_work_order_status:   'update_work_order_status',
  add_work_log_comment:       'add_work_log_comment',
  update_gps_location:        'update_location_manual',
  update_operational_status:  'update_operational_status',
};

// ─── Sincronizar una operación ────────────────────────────────────────────────

async function syncOperation(item: OfflineSyncItem): Promise<void> {
  const rpcName = OPERATION_RPC_MAP[item.operation];
  if (!rpcName) throw new Error(`RPC desconocida para operación: ${item.operation}`);

  const payload = JSON.parse(item.payload);

  const { data, error } = await rpc(rpcName, payload);
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.error ?? 'Error en RPC');
}

// ─── Sincronizar evidencia ────────────────────────────────────────────────────

async function syncEvidence(ev: OfflineEvidence): Promise<void> {
  // 1. Subir archivo a Supabase Storage
  const byteCharacters = atob(ev.base64Data);
  const byteNumbers    = Array.from({ length: byteCharacters.length }, (_, i) => byteCharacters.charCodeAt(i));
  const byteArray      = new Uint8Array(byteNumbers);
  const blob           = new Blob([byteArray], { type: ev.mimeType });
  const file           = new File([blob], ev.fileName, { type: ev.mimeType });

  const storagePath = `${ev.workspaceId}/${Date.now()}_${ev.fileName}`;
  const { error: uploadError } = await supabase.storage
    .from('evidences')
    .upload(storagePath, file, { contentType: ev.mimeType, upsert: false });

  if (uploadError) throw uploadError;

  // 2. Registrar evidencia en DB via RPC
  const { data, error: rpcError } = await rpc('register_evidence_file', {
    p_workspace_id:  ev.workspaceId,
    p_work_order_id: ev.workOrderId ?? null,
    p_order_id:      ev.orderId ?? null,
    p_file_type:     ev.fileType,
    p_file_name:     ev.fileName,
    p_mime_type:     ev.mimeType,
    p_storage_path:  storagePath,
    p_file_size:     ev.fileSizeBytes,
    p_description:   ev.description ?? null,
  });

  if (rpcError) throw rpcError;
  if (data && data.ok === false) throw new Error(data.error ?? 'Error al registrar evidencia');
}

// ─── Motor principal de sincronización ───────────────────────────────────────

export interface SyncResult {
  processed:  number;
  failed:     number;
  evidences:  number;
  errors:     string[];
}

export async function runSync(): Promise<SyncResult> {
  const result: SyncResult = { processed: 0, failed: 0, evidences: 0, errors: [] };

  // 1. Sincronizar operaciones en cola
  const pending = await getPendingOperations();

  for (const item of pending) {
    if (!item.id) continue;

    // Marcar como syncing
    await offlineDB.syncQueue.update(item.id, { status: 'syncing' });

    try {
      await syncOperation(item);
      await markSyncCompleted(item.id);
      result.processed++;
    } catch (err) {
      const errMsg   = String(err);
      const newRetries = item.retries + 1;
      await markSyncFailed(item.id, errMsg, newRetries);
      result.failed++;
      result.errors.push(`${item.operation}: ${errMsg}`);
    }
  }

  // 2. Sincronizar evidencias offline
  const pendingEv = await getPendingEvidences();

  for (const ev of pendingEv) {
    if (!ev.id) continue;

    await offlineDB.evidences.update(ev.id, { syncStatus: 'syncing' });

    try {
      await syncEvidence(ev);
      await offlineDB.evidences.update(ev.id, { syncStatus: 'completed' });
      result.evidences++;
    } catch (err) {
      const errMsg = String(err);
      await offlineDB.evidences.update(ev.id, { syncStatus: 'failed' });
      result.failed++;
      result.errors.push(`evidence/${ev.fileName}: ${errMsg}`);
    }
  }

  // 3. Limpiar ítems completados viejos
  await cleanupCompletedItems(7);

  return result;
}
