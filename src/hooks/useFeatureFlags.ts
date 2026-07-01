/**
 * useFeatureFlags — Obtiene todos los feature flags del plan actual en una sola query.
 *
 * Más eficiente que llamar useFeatureAccess() por cada flag individualmente.
 * Cachea 5 minutos. Zero Trust: siempre del backend.
 */
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { supabase } from '../lib/supabaseClient';

export interface FeatureFlags {
  ai_enabled:               boolean;
  photo_quote_enabled:      boolean;
  templates_enabled:        boolean;
  branding_enabled:         boolean;
  custom_qr_enabled:        boolean;
  advanced_reports_enabled: boolean;
  multiuser_enabled:        boolean;
  quote_editing_enabled:    boolean;
  pipeline_enabled:         boolean;
  orders_enabled:           boolean;
  work_orders_enabled:      boolean;
  gps_enabled:              boolean;
  ai_credits_enabled:       boolean;
  storage_enabled:          boolean;
  automation_enabled:       boolean;
  webhook_enabled:          boolean;
  ai_advanced_enabled:      boolean;
  ai_forecasting_enabled:   boolean;
  ai_agents_enabled:        boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  ai_enabled: false, photo_quote_enabled: false, templates_enabled: false,
  branding_enabled: false, custom_qr_enabled: false, advanced_reports_enabled: false,
  multiuser_enabled: false, quote_editing_enabled: false, pipeline_enabled: false,
  orders_enabled: false, work_orders_enabled: false, gps_enabled: false,
  ai_credits_enabled: false, storage_enabled: false, automation_enabled: false,
  webhook_enabled: false, ai_advanced_enabled: false, ai_forecasting_enabled: false,
  ai_agents_enabled: false,
};

async function fetchFeatureFlags(workspaceId: string): Promise<FeatureFlags> {
  // Obtiene el plan_code del workspace y sus flags en 1 query
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .single();

  if (!profile) return DEFAULT_FLAGS;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (supabase as any).rpc('get_effective_plan_code', { p_workspace_id: workspaceId });

  const planCode = (sub as string | null) ?? 'free';

  const { data: flags } = await supabase
    .from('plan_features')
    .select('*')
    .eq('plan_code', planCode)
    .single();

  if (!flags) return DEFAULT_FLAGS;

  return {
    ai_enabled:               flags.ai_enabled               ?? false,
    photo_quote_enabled:      flags.photo_quote_enabled      ?? false,
    templates_enabled:        flags.templates_enabled         ?? false,
    branding_enabled:         flags.branding_enabled          ?? false,
    custom_qr_enabled:        flags.custom_qr_enabled         ?? false,
    advanced_reports_enabled: flags.advanced_reports_enabled  ?? false,
    multiuser_enabled:        flags.multiuser_enabled          ?? false,
    quote_editing_enabled:    flags.quote_editing_enabled      ?? false,
    pipeline_enabled:         flags.pipeline_enabled           ?? false,
    orders_enabled:           flags.orders_enabled             ?? false,
    work_orders_enabled:      flags.work_orders_enabled        ?? false,
    gps_enabled:              flags.gps_enabled                ?? false,
    ai_credits_enabled:       flags.ai_credits_enabled         ?? false,
    storage_enabled:          flags.storage_enabled            ?? false,
    automation_enabled:       (flags as any).automation_enabled ?? false,
    webhook_enabled:          (flags as any).webhook_enabled    ?? false,
    ai_advanced_enabled:      (flags as any).ai_advanced_enabled    ?? false,
    ai_forecasting_enabled:   (flags as any).ai_forecasting_enabled ?? false,
    ai_agents_enabled:        (flags as any).ai_agents_enabled      ?? false,
  };
}

export function useFeatureFlags() {
  const { workspace } = useWorkspace();

  const query = useQuery({
    queryKey:  ['featureFlags', workspace.id],
    queryFn:   () => fetchFeatureFlags(workspace.id),
    staleTime: 5 * 60_000,  // 5 minutos
    gcTime:    10 * 60_000,
  });

  return {
    flags:     query.data ?? DEFAULT_FLAGS,
    isLoading: query.isLoading,
  };
}
