import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthProvider';
import { getProfile, getWorkspace, getCompanySettings, getCurrentPlanName } from '../../services/workspaces';
import type { Profile, Workspace, CompanySettings } from '../../lib/types';

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
