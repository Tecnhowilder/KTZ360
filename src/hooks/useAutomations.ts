import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  listAutomationRules, installAutomationTemplates,
  toggleAutomationRule, createAutomationRule,
  type AutomationCondition,
} from '../services/automations';
import { useToast } from '../components/ui/Toast';

export function useAutomations() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  ['automations', workspace.id],
    queryFn:   () => listAutomationRules(workspace.id),
    staleTime: 30_000,
    retry: false,
  });
}

export function useInstallTemplates() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (templateKeys?: string[]) => installAutomationTemplates(workspace.id, templateKeys),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automations', workspace.id] });
      showToast(data.installed > 0 ? `${data.installed} automatizaciones instaladas` : 'Ya instaladas');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useToggleRule() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      toggleAutomationRule(ruleId, enabled),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['automations', workspace.id] });
      showToast(vars.enabled ? 'Automatización activada' : 'Automatización pausada');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (args: {
      name: string; triggerEvent: string; actionType: string;
      delayHours?: number; conditions?: AutomationCondition[];
      actionPayload?: Record<string, unknown>; description?: string;
    }) => createAutomationRule(workspace.id, args.name, args.triggerEvent, args.actionType, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', workspace.id] });
      showToast('Automatización creada');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}
