import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { navigateToUrl } from '../lib/capacitorBridge';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  getIntegrationStatus, initiateOAuth, disconnectIntegration,
  configureWhatsApp, triggerIntegrationWorker, updateIntegrationAutoSync,
  type IntegrationProvider, type WhatsAppConfig,
} from '../services/integrations';
import { useToast } from '../components/ui/Toast';

const STALE = 30_000;

export function useIntegrations() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  ['integrations', workspace.id],
    queryFn:   () => getIntegrationStatus(workspace.id),
    staleTime: STALE,
    retry:     false,
  });
}

export function useInitiateOAuth() {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (provider: 'google_calendar' | 'outlook_calendar' | 'drive' | 'onedrive' | 'teams') =>
      initiateOAuth(workspace.id, provider),
    onSuccess: ({ authorizationUrl }) => {
      // Sprint 22: Capacitor-safe — in-app browser en native
      navigateToUrl(authorizationUrl);
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al iniciar conexión'),
  });
}

export function useDisconnectIntegration() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (provider: IntegrationProvider) => disconnectIntegration(workspace.id, provider),
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspace.id] });
      showToast(`${provider} desconectado`);
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al desconectar'),
  });
}

export function useConfigureWhatsApp() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (config: WhatsAppConfig) => configureWhatsApp(workspace.id, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspace.id] });
      showToast('WhatsApp configurado correctamente');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al configurar WhatsApp'),
  });
}

export function useUpdateAutoSync() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: ({ provider, autoSync }: { provider: IntegrationProvider; autoSync: boolean }) =>
      updateIntegrationAutoSync(workspace.id, provider, autoSync),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspace.id] });
      showToast(vars.autoSync ? 'Sincronización automática activada' : 'Sincronización automática desactivada');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useConnectAlegra() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: async ({ email, token, autoInvoice }: { email: string; token: string; autoInvoice: boolean }) => {
      const { data: { session } } = await (await import('../lib/supabaseClient')).supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión activa');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/connect-integration`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'alegra', action: 'connect', alegra_email: email, alegra_token: token, auto_invoice: autoInvoice }),
      });
      const result = await resp.json();
      if (!result.ok) throw new Error(result.error ?? 'Error al conectar Alegra');
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspace.id] });
      showToast(`Alegra conectado: ${data.company_name ?? 'Tu empresa'}`);
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al conectar Alegra'),
  });
}

export function useTriggerWorker() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: () => triggerIntegrationWorker(workspace.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspace.id] });
      showToast(`Sincronización: ${result.processed} procesados, ${result.failed} fallidos`);
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al sincronizar'),
  });
}
