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
import { getTeamSeats, listTeamMembers, listPendingInvitations, listInvitationHistory } from '../services/team';

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

export function useTeamSeats() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['teamSeats', workspace.id],
    queryFn: () => getTeamSeats(workspace.id),
  });
}

export function useTeamMembers() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['teamMembers', workspace.id],
    queryFn: () => listTeamMembers(workspace.id),
  });
}

export function usePendingInvitations() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['pendingInvitations', workspace.id],
    queryFn: () => listPendingInvitations(workspace.id),
  });
}

export function useInvitationHistory() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['invitationHistory', workspace.id],
    queryFn: () => listInvitationHistory(workspace.id),
  });
}
