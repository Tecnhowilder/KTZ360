import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  getEvidenceGallery, uploadEvidence, deleteEvidence, getStorageUsage,
  type UploadEvidenceInput,
} from '../services/evidences';
import { useToast } from '../components/ui/Toast';
import type { EvidenceFileType } from '../lib/database.types';

const STALE = 30_000;

// ─── Galería ──────────────────────────────────────────────────────────────────

export function useEvidenceGallery(opts: {
  orderId?:     string;
  workOrderId?: string;
  fileType?:    EvidenceFileType;
}) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['evidenceGallery', workspace.id, opts.orderId, opts.workOrderId, opts.fileType],
    queryFn:  () => getEvidenceGallery(opts),
    enabled:  !!(opts.orderId || opts.workOrderId),
    staleTime: STALE,
  });
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export function useUploadEvidence(opts: { orderId?: string; workOrderId?: string }) {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (input: UploadEvidenceInput) => uploadEvidence(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidenceGallery', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['storageUsage', workspace.id] });
      if (opts.orderId) {
        queryClient.invalidateQueries({ queryKey: ['orderDetail', opts.orderId] });
      }
      if (opts.workOrderId) {
        queryClient.invalidateQueries({ queryKey: ['workOrderDetail', opts.workOrderId] });
      }
      showToast('Evidencia subida correctamente');
    },
    onError: (err: Error) => showToast(err.message ?? 'Error al subir evidencia'),
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteEvidence() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({ evidenceId, storagePath }: { evidenceId: string; storagePath: string }) =>
      deleteEvidence(evidenceId, storagePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidenceGallery', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['storageUsage', workspace.id] });
      showToast('Evidencia eliminada');
    },
    onError: (err: Error) => showToast(err.message ?? 'Error al eliminar'),
  });
}

// ─── Storage usage ────────────────────────────────────────────────────────────

export function useStorageUsage() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['storageUsage', workspace.id],
    queryFn:  () => getStorageUsage(workspace.id),
    staleTime: 60_000,
    retry: false,
  });
}
