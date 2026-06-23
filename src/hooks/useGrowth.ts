import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  getGrowthDashboard, getReferralDashboard, createReferralLink,
  upsertReferralProgram, getActivePromotions, getUtmAnalytics,
  applyPromotion, validateCoupon,
  type ReferralProgram,
} from '../services/growth';
import { useToast } from '../components/ui/Toast';

const STALE = 60_000;

export function useGrowthDashboard() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['growthDashboard', workspace.id],
    queryFn:  () => getGrowthDashboard(workspace.id),
    staleTime: STALE, retry: false,
  });
}

export function useReferralDashboard() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['referralDashboard', workspace.id],
    queryFn:  () => getReferralDashboard(workspace.id),
    staleTime: STALE, retry: false,
  });
}

export function useCreateReferralLink(clientId?: string) {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: () => createReferralLink(workspace.id, clientId),
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useUpsertReferralProgram() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (program: Partial<ReferralProgram>) => upsertReferralProgram(workspace.id, program),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referralDashboard', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['growthDashboard', workspace.id] });
      showToast('Programa de referidos actualizado');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useActivePromotions() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['activePromotions', workspace.id],
    queryFn:  () => getActivePromotions(workspace.id),
    staleTime: STALE,
  });
}

export function useUtmAnalytics(days = 30) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['utmAnalytics', workspace.id, days],
    queryFn:  () => getUtmAnalytics(workspace.id, days),
    staleTime: STALE, retry: false,
  });
}

export function useApplyPromotion() {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: ({ code, quoteId }: { code: string; quoteId: string }) =>
      applyPromotion(workspace.id, code, quoteId),
    onSuccess: (data) => showToast(data.message ?? 'Descuento aplicado'),
    onError: (e: Error) => showToast(e.message ?? 'Error al aplicar cupón'),
  });
}

export function useValidateCoupon() {
  const { workspace } = useWorkspace();
  return (code: string, quoteTotal: number) => validateCoupon(workspace.id, code, quoteTotal);
}
