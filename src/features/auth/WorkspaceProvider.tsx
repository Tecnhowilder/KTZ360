import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthProvider';
import { getProfile, getWorkspace, getCompanySettings, getCurrentPlanName } from '../../services/workspaces';
import type { Profile, Workspace, CompanySettings } from '../../lib/types';
import { supabase } from '../../lib/supabaseClient';

interface WorkspaceContextValue {
  profile: Profile;
  workspace: Workspace;
  company: CompanySettings;
  planName: string;
  loading: false;
}

interface WorkspaceContextLoading {
  profile?: undefined;
  workspace?: undefined;
  company?: undefined;
  planName?: undefined;
  loading: true;
}

const WorkspaceContext = createContext<WorkspaceContextValue | WorkspaceContextLoading | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: !!user,
  });

  const workspaceId = profileQuery.data?.workspace_id;
  const sessionRegistered = useRef(false);

  // Sprint 24 D1: registrar sesión activa cuando workspace_id está disponible
  useEffect(() => {
    if (!workspaceId || sessionRegistered.current) return;
    sessionRegistered.current = true;

    const deviceId = (() => {
      try {
        const existing = localStorage.getItem('shelwi_device_id');
        if (existing) return existing;
        const newId = crypto.randomUUID();
        localStorage.setItem('shelwi_device_id', newId);
        return newId;
      } catch { return crypto.randomUUID(); }
    })();

    const ua = navigator.userAgent;
    const deviceName = /iPhone|iPad/.test(ua) ? 'iOS'
      : /Android/.test(ua) ? 'Android'
      : /Mac/.test(ua) ? 'Mac'
      : /Windows/.test(ua) ? 'Windows'
      : 'Navegador';

    supabase.rpc('register_session' as never, {
      p_workspace_id: workspaceId,
      p_device_id:    deviceId,
      p_device_name:  deviceName,
      p_user_agent:   ua.slice(0, 500),
    } as never).then(() => {});
  }, [workspaceId]);

  const workspaceQuery = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => getWorkspace(workspaceId!),
    enabled: !!workspaceId,
  });

  const companyQuery = useQuery({
    queryKey: ['companySettings', workspaceId],
    queryFn: () => getCompanySettings(workspaceId!),
    enabled: !!workspaceId,
  });

  const planQuery = useQuery({
    queryKey: ['planName', workspaceId],
    queryFn: () => getCurrentPlanName(workspaceId!),
    enabled: !!workspaceId,
  });

  const loading =
    profileQuery.isLoading || workspaceQuery.isLoading || companyQuery.isLoading || planQuery.isLoading;

  const value: WorkspaceContextValue | WorkspaceContextLoading =
    !loading && profileQuery.data && workspaceQuery.data && companyQuery.data && planQuery.data
      ? {
          profile: profileQuery.data,
          workspace: workspaceQuery.data,
          company: companyQuery.data,
          planName: planQuery.data,
          loading: false,
        }
      : { loading: true };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace debe usarse dentro de WorkspaceProvider');
  if (ctx.loading) throw new Error('useWorkspace: workspace aún cargando, usa useWorkspaceMaybe en su lugar');
  return ctx;
}

export function useWorkspaceMaybe(): WorkspaceContextValue | WorkspaceContextLoading {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaceMaybe debe usarse dentro de WorkspaceProvider');
  return ctx;
}

export function useInvalidateWorkspace() {
  const queryClient = useQueryClient();
  return (workspaceId: string) => {
    queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    queryClient.invalidateQueries({ queryKey: ['companySettings', workspaceId] });
  };
}
