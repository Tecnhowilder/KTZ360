/**
 * evidences.ts — Servicio de Evidencias Sprint 7
 * Zero Trust: todas las validaciones ocurren en backend (RPCs security definer).
 *
 * Flujo aprobado:
 *   1. check_evidence_upload_allowed() → backend valida cuota/plan/mime → devuelve path
 *   2. compressImage() → cliente comprime (optimización, no seguridad)
 *   3. supabase.storage.from('evidences').upload(path, file) → RLS enforced
 *   4. register_evidence_file() → backend re-valida, registra, actualiza cuota
 *   5. delete_evidence_file() → backend soft-delete + decrementa cuota
 */
import { supabase } from '../lib/supabaseClient';
import type { EvidenceFileWithUploader, EvidenceFileType, StorageUsage } from '../lib/database.types';

const BUCKET = 'evidences';

// ─── Tipos de entrada ────────────────────────────────────────────────────────

export interface UploadEvidenceInput {
  file:          File;
  orderId?:      string | null;
  workOrderId?:  string | null;
  caption?:      string | null;
  isSignature?:  boolean;
}

export interface EvidenceGalleryResult {
  files: EvidenceFileWithUploader[];
  total: number;
}

export interface UploadAllowedResult {
  upload_path: string;
  file_type:   EvidenceFileType;
  workspace_id: string;
  quota: {
    used_bytes: number;
    max_bytes:  number;
    available_bytes: number;
    pct_used: number;
  };
}

// ─── Compresión cliente-side (Canvas API) ────────────────────────────────────
// Optimización visual — el backend sigue validando tamaño (Zero Trust).

const IMAGE_MIMES = new Set(['image/jpeg','image/jpg','image/png','image/webp']);
const MAX_DIMENSION = 1920;
const JPEG_QUALITY  = 0.82;

export function isCompressibleImage(file: File): boolean {
  return IMAGE_MIMES.has(file.type) && !file.name.toLowerCase().endsWith('.svg');
}

export async function compressImage(file: File): Promise<File> {
  if (!isCompressibleImage(file)) return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        // No necesita resize — solo reencoda si es PNG grande
        if (file.type === 'image/png' && file.size > 500_000) {
          const canvas = document.createElement('canvas');
          canvas.width  = width;
          canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          canvas.toBlob(
            blob => resolve(new File([blob!], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
            'image/jpeg', JPEG_QUALITY
          );
        } else {
          resolve(file);
        }
        return;
      }

      // Redimensionar manteniendo relación
      if (width > height) { height = Math.round((height * MAX_DIMENSION) / width); width = MAX_DIMENSION; }
      else                 { width  = Math.round((width  * MAX_DIMENSION) / height); height = MAX_DIMENSION; }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg', JPEG_QUALITY
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Error al cargar imagen')); };
    img.src = url;
  });
}

// ─── Helper: RPC tipado ───────────────────────────────────────────────────────

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const result = data as { ok: boolean; error?: string } & T;
  if (!result.ok) throw new Error(result.error ?? `Error en ${name}`);
  return result as T;
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────

export async function uploadEvidence(input: UploadEvidenceInput): Promise<EvidenceFileWithUploader> {
  const { file: rawFile, orderId, workOrderId, caption, isSignature = false } = input;

  // Paso 1 — Comprimir si aplica (optimización cliente, no seguridad)
  const file = await compressImage(rawFile);

  // Paso 2 — Validación backend: cuota, plan, mime, tamaño
  const allowed = await rpc<UploadAllowedResult>('check_evidence_upload_allowed', {
    p_order_id:      orderId      ?? null,
    p_work_order_id: workOrderId  ?? null,
    p_file_name:     file.name,
    p_file_size:     file.size,
    p_mime_type:     file.type,
  });

  // Paso 3 — Upload a Supabase Storage (RLS enforced)
  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .upload(allowed.upload_path, file, { upsert: false, contentType: file.type });

  if (storageErr) {
    throw new Error('Error al subir el archivo: ' + storageErr.message);
  }

  // Paso 4 — Registrar en backend (doble validación Zero Trust)
  try {
    const registered = await rpc<{ evidence_id: string; file_type: EvidenceFileType }>('register_evidence_file', {
      p_storage_path:   allowed.upload_path,
      p_order_id:       orderId      ?? null,
      p_work_order_id:  workOrderId  ?? null,
      p_file_name:      file.name,
      p_file_size:      file.size,
      p_mime_type:      file.type,
      p_caption:        caption ?? null,
      p_is_signature:   isSignature,
      p_duration_sec:   null,
      p_thumbnail_path: null,
    });

    return {
      id:             registered.evidence_id,
      workspace_id:   allowed.workspace_id,
      order_id:       orderId ?? null,
      work_order_id:  workOrderId ?? null,
      uploaded_by:    '',
      file_name:      file.name,
      file_size:      file.size,
      mime_type:      file.type,
      storage_path:   allowed.upload_path,
      file_type:      registered.file_type,
      caption:        caption ?? null,
      is_signature:   isSignature,
      duration_sec:   null,
      thumbnail_path: null,
      metadata:       {},
      deleted_at:     null,
      created_at:     new Date().toISOString(),
      uploader_name:  null,
    };
  } catch (err) {
    // Si el registro falla, limpiar el archivo de storage
    await supabase.storage.from(BUCKET).remove([allowed.upload_path]);
    throw err;
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteEvidence(evidenceId: string, storagePath: string): Promise<void> {
  // 1. Soft delete en DB + decrementa cuota
  await rpc('delete_evidence_file', { p_evidence_id: evidenceId });

  // 2. Eliminar físicamente del bucket
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.warn('[evidences] No se pudo eliminar del storage:', error.message);
    // No lanzar error — el soft-delete ya ocurrió. Cleanup periódico lo manejará.
  }
}

// ─── GALERÍA ──────────────────────────────────────────────────────────────────

export async function getEvidenceGallery(opts: {
  orderId?:      string;
  workOrderId?:  string;
  fileType?:     EvidenceFileType;
  limit?:        number;
}): Promise<EvidenceGalleryResult> {
  const data = await rpc<{ files: EvidenceFileWithUploader[]; total: number }>('get_evidence_gallery', {
    p_order_id:      opts.orderId      ?? null,
    p_work_order_id: opts.workOrderId  ?? null,
    p_file_type:     opts.fileType     ?? null,
    p_limit:         opts.limit        ?? 50,
  });
  return { files: data.files ?? [], total: data.total ?? 0 };
}

// ─── URLS firmadas para visualización ─────────────────────────────────────────

export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) throw new Error('No se pudo obtener URL firmada');
  return data.signedUrl;
}

export async function getSignedUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach(item => { if (item.signedUrl && item.path) map[item.path] = item.signedUrl; });
  return map;
}

// ─── ALMACENAMIENTO ───────────────────────────────────────────────────────────

export async function getStorageUsage(workspaceId: string): Promise<StorageUsage> {
  const data = await rpc<StorageUsage>('get_storage_usage', { p_workspace_id: workspaceId });
  return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export const EVIDENCE_ACCEPT: Record<EvidenceFileType, string> = {
  image:     'image/jpeg,image/png,image/webp',
  video:     'video/mp4,video/quicktime,video/webm',
  audio:     'audio/mpeg,audio/wav,audio/mp4,audio/ogg',
  document:  'application/pdf',
  signature: 'image/png,image/webp,image/svg+xml',
};

export const ALL_EVIDENCE_ACCEPT = Object.values(EVIDENCE_ACCEPT).join(',');

export function mimeToFileType(mime: string): EvidenceFileType | null {
  if (['image/jpeg','image/jpg','image/png','image/webp'].includes(mime)) return 'image';
  if (['video/mp4','video/quicktime','video/webm'].includes(mime)) return 'video';
  if (['audio/mpeg','audio/wav','audio/mp4','audio/ogg'].includes(mime)) return 'audio';
  if (mime === 'application/pdf') return 'document';
  if (mime === 'image/svg+xml') return 'signature';
  return null;
}
