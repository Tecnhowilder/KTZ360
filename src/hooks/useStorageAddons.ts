import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useToast } from '../components/ui/Toast';
import {
  getWorkspaceStorageAddons,
  activateStorageAddon,
  cancelStorageAddon,
} from '../services/storageAddons';

export function useWorkspaceStorageAddons() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['storageAddons', workspace.id],
    queryFn: () => getWorkspaceStorageAddons(workspace.id),
    staleTime: 60_000,
  });
}

export function useActivateStorageAddon() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({ gb, unitPrice }: { gb: 10 | 25 | 50; unitPrice: number }) =>
      activateStorageAddon(workspace.id, gb, unitPrice),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['storageAddons', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['storageUsage', workspace.id] });
      showToast(data.message);
    },
    onError: (err: Error) => showToast(err.message ?? 'Error al activar paquete'),
  });
}

export function useCancelStorageAddon() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({ addonId }: { addonId: string }) => cancelStorageAddon(addonId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['storageAddons', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['storageUsage', workspace.id] });
      showToast(data.message);
    },
    onError: (err: Error) => showToast(err.message ?? 'Error al cancelar paquete'),
  });
}
