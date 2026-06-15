import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  checkFeatureAccess,
  checkPlanLimit,
  checkSubscriptionStatus,
  getPdfTier,
  type PlanFeature,
  type PlanLimitKey,
} from '../lib/permissions';

export function usePlanLimit(limit: PlanLimitKey) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['planLimit', workspace.id, limit],
    queryFn: () => checkPlanLimit(workspace.id, limit),
  });
}

export function useFeatureAccess(feature: PlanFeature) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['featureAccess', workspace.id, feature],
    queryFn: () => checkFeatureAccess(workspace.id, feature),
  });
}

export function useSubscriptionStatus() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['subscriptionStatus', workspace.id],
    queryFn: () => checkSubscriptionStatus(workspace.id),
  });
}

export function usePdfTier() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['pdfTier', workspace.id],
    queryFn: () => getPdfTier(workspace.id),
  });
}
