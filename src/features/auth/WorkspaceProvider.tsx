import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthProvider';
import { getProfile, getWorkspace, getCompanySettings, getCurrentPlanName } from '../../services/workspaces';
import type { Profile, Workspace, CompanySettings } from '../../lib/types';
import { supabase } from '../../lib/supabaseClient';
import { initPushNotifications } from '../../services/pushNotifications';

// ─── Tipos de estado del contexto ────────────────────────────────────────────
//
// Estados posibles, cada uno semánticamente distinto — nunca se ocultan unos
// a otros ni se colapsan en "loading":
//
//   loading   — queries en vuelo, aún no hay resultado
//   error     — excepción real (red, RLS que lanza, error inesperado)
//   notFound  — la query RESOLVIÓ correctamente pero la fila no existe
//               (maybySingle() → null). Esto NO es una excepción: es un
//               estado de datos legítimo (perfil borrado, workspace
//               eliminado, trigger de signup incompleto, cross-tenant).
//   forbidden — el perfil existe pero status !== 'active' (invited,
//               inactive, removed). Gating de Zero Trust a nivel de
//               aplicación: profiles_select_own permite LEER la fila
//               propia sin importar el status, pero el acceso a la app
//               solo se concede a miembros activos.
//   ready     — los 4 recursos cargaron con éxito.

interface WorkspaceContextValue {
  profile:   Profile;
  workspace: Workspace;
  company:   CompanySettings;
  planName:  string;
  loading:   false;
  error?:    never;
  notFound?: never;
  forbidden?: never;
}

interface WorkspaceContextLoading {
  profile?:  undefined;
  workspace?: undefined;
  company?:  undefined;
  planName?: undefined;
  loading:   true;
  error?:    never;
  notFound?: never;
  forbidden?: never;
}

interface WorkspaceContextError {
  profile?:  undefined;
  workspace?: undefined;
  company?:  undefined;
  planName?: undefined;
  loading:   false;
  error:     Error;
  notFound?: never;
  forbidden?: never;
}

interface WorkspaceContextNotFound {
  profile?:  undefined;
  workspace?: undefined;
  company?:  undefined;
  planName?: undefined;
  loading:   false;
  error?:    never;
  /** Cuál de los recursos resolvió a null */
  notFound:  'profile' | 'workspace' | 'company';
  forbidden?: never;
}

interface WorkspaceContextForbidden {
  profile?:  undefined;
  workspace?: undefined;
  company?:  undefined;
  planName?: undefined;
  loading:   false;
  error?:    never;
  notFound?: never;
  forbidden: true;
  /** Status real del perfil para mensaje específico en la UI */
  profileStatus: string;
}

type WorkspaceContextState =
  | WorkspaceContextValue
  | WorkspaceContextLoading
  | WorkspaceContextError
  | WorkspaceContextNotFound
  | WorkspaceContextForbidden;

const WorkspaceContext = createContext<WorkspaceContextState | undefined>(undefined);

// ─── Data fetching + session registration ─────────────────────────────────────
// ORDEN DE HOOKS — crítico para cumplir las Rules of Hooks de React.
//
// React identifica cada hook por su POSICIÓN en el call stack del componente.
// El orden en este hook es el mismo que tenía WorkspaceProvider originalmente:
//
//   [1] useQuery (profileQuery)
//   [2] useRef   (sessionRegistered)       <- session registration
//   [3] useEffect(session registration)    <- session registration
//   [4] useQuery (workspaceQuery)
//   [5] useQuery (companyQuery)
//   [6] useQuery (planQuery)
//
// Sacar useRef/useEffect de sesión fuera de esta función (al final de todo)
// cambiaría las posiciones 2 y 3, lo que viola las Rules of Hooks durante
// HMR/Fast Refresh en desarrollo y puede causar comportamiento impredecible.
//
// Diseño de queries:
//   queryKey:  idénticas a la versión original (caché compartida)
//   enabled:   workspace/company/plan bloqueados hasta profileActive (Zero Trust)
//   staleTime: 60 s perfil/workspace/company · 5 min plan

function useWorkspaceQueries(userId: string | undefined) {

  // [1] Profile — getProfile usa maybySingle(): null es resultado válido.
  const profileQuery = useQuery({
    queryKey:  ['profile', userId],
    queryFn:   () => getProfile(userId!),
    enabled:   !!userId,
    retry:     2,
    staleTime: 60_000,
  });

  const profile       = profileQuery.data ?? null;
  const workspaceId   = profile?.workspace_id;
  // Zero Trust: solo perfiles activos acceden al workspace.
  const profileActive = profile?.status === 'active';

  // [2-3] Session registration (Sprint 24 D1) — DEBE quedar en esta posición.
  // Registra el dispositivo la primera vez que un perfil activo se resuelve.
  // Complementa useSessionGuard (heartbeat de 30 s para revocar sesiones).
  const sessionRegistered = useRef(false);
  useEffect(() => {
    if (!workspaceId || !profileActive || sessionRegistered.current) return;
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
      : /Mac/.test(ua)     ? 'Mac'
      : /Windows/.test(ua) ? 'Windows'
      : 'Navegador';

    supabase.rpc('register_session' as never, {
      p_workspace_id: workspaceId,
      p_device_id:    deviceId,
      p_device_name:  deviceName,
      p_user_agent:   ua.slice(0, 500),
    } as never).then(() => {});
  }, [workspaceId, profileActive]);

  // [4-6] Workspace, Company, Plan — solo si perfil activo (cascada Zero Trust).
  const workspaceQuery = useQuery({
    queryKey:  ['workspace', workspaceId],
    queryFn:   () => getWorkspace(workspaceId!),
    enabled:   !!workspaceId && profileActive,
    retry:     2,
    staleTime: 60_000,
  });

  const companyQuery = useQuery({
    queryKey:  ['companySettings', workspaceId],
    queryFn:   () => getCompanySettings(workspaceId!),
    enabled:   !!workspaceId && profileActive,
    retry:     2,
    staleTime: 60_000,
  });

  const planQuery = useQuery({
    queryKey:  ['planName', workspaceId],
    queryFn:   () => getCurrentPlanName(workspaceId!),
    enabled:   !!workspaceId && profileActive,
    retry:     2,
    staleTime: 5 * 60_000,
  });

  const isLoading =
    profileQuery.isLoading ||
    (profileActive && (workspaceQuery.isLoading || companyQuery.isLoading || planQuery.isLoading));

  // Excepciones reales (red, RLS que lanza). Nunca incluye "0 filas" -> eso es null.
  const isError =
    profileQuery.isError   ||
    workspaceQuery.isError ||
    companyQuery.isError   ||
    planQuery.isError;

  const firstError =
    profileQuery.error   ||
    workspaceQuery.error ||
    companyQuery.error   ||
    planQuery.error;

  return {
    profile, workspaceId, profileActive,
    profileQuery, workspaceQuery, companyQuery, planQuery,
    isLoading, isError, firstError,
  };
}

// ─── Máquina de estados del workspace ────────────────────────────────────────
// Función PURA: sin hooks, sin side effects, completamente testeable.
// Recibe los resultados de los queries + estado local y retorna uno de los
// 5 estados semánticos definidos en WorkspaceContextState.
//
//   computeWorkspaceState({ hasUser: false, ... }) -> { loading: false, notFound: 'profile' }

interface WorkspaceStateArgs {
  hasUser:            boolean;
  timedOut:           boolean;
  isLoading:          boolean;
  isError:            boolean;
  firstError:         unknown;
  profileIsSuccess:   boolean;
  profile:            Profile | null;
  profileActive:      boolean;
  workspaceIsSuccess: boolean;
  workspaceData:      Workspace | null | undefined;
  companyIsSuccess:   boolean;
  companyData:        CompanySettings | null | undefined;
  planData:           string | null | undefined;
}

function computeWorkspaceState(a: WorkspaceStateArgs): WorkspaceContextState {
  // 0) Sin usuario autenticado. ProtectedRoute redirige antes de montar
  //    este provider, pero se cubre aquí como defensa en profundidad.
  if (!a.hasUser) return { loading: false, notFound: 'profile' };

  // 1) Error real (red, RLS que lanza) — no se oculta ni reintenta infinitamente.
  if (a.isError) return { loading: false, error: (a.firstError as Error) ?? new Error('Error al cargar tu cuenta') };

  // 2) Timeout de seguridad (15 s).
  if (a.timedOut && a.isLoading) return { loading: false, error: new Error('La carga tardó demasiado. Verifica tu conexión e intenta de nuevo.') };

  // 3) Aún cargando.
  if (a.isLoading) return { loading: true };

  // 4) Profile resolvió — distinguir notFound / forbidden / active.
  if (a.profileIsSuccess) {
    if (a.profile === null) return { loading: false, notFound: 'profile' };

    // Zero Trust: solo 'active' obtiene acceso al workspace.
    if (!a.profileActive) return { loading: false, forbidden: true, profileStatus: a.profile.status };

    // Perfil activo — verificar el resto de recursos.
    if (a.workspaceIsSuccess && a.workspaceData === null) return { loading: false, notFound: 'workspace' };
    if (a.companyIsSuccess   && a.companyData   === null) return { loading: false, notFound: 'company'   };

    if (a.workspaceData && a.companyData && a.planData) {
      return {
        profile:   a.profile,
        workspace: a.workspaceData,
        company:   a.companyData,
        planName:  a.planData,
        loading:   false,
      };
    }
  }

  // Fallback — dependencias en cascada aún resolviendo.
  return { loading: true };
}

// ─── WorkspaceProvider ───────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Timeout de seguridad: nunca dejar spinner más de 15 segundos.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 15_000);
    return () => clearTimeout(t);
  }, []);

  // Queries + session registration. El orden interno de hooks está fijo
  // y documentado dentro de useWorkspaceQueries.
  const {
    profile, profileActive,
    profileQuery, workspaceQuery, companyQuery, planQuery,
    isLoading, isError, firstError,
  } = useWorkspaceQueries(user?.id);

  const value = computeWorkspaceState({
    hasUser:            !!user,
    timedOut,
    isLoading,
    isError,
    firstError,
    profileIsSuccess:   profileQuery.isSuccess,
    profile,
    profileActive,
    workspaceIsSuccess: workspaceQuery.isSuccess,
    workspaceData:      workspaceQuery.data,
    companyIsSuccess:   companyQuery.isSuccess,
    companyData:        companyQuery.data,
    planData:           planQuery.data,
  });

  // Inicializar push notifications una sola vez cuando el perfil está activo.
  // initPushNotifications es no-op en web; en native pide permiso y registra token.
  const pushInited = useRef(false);
  useEffect(() => {
    if (!profileActive || pushInited.current) return;
    pushInited.current = true;
    void initPushNotifications();
  }, [profileActive]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

// ─── Hooks públicos ──────────────────────────────────────────────────────────

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace debe usarse dentro de WorkspaceProvider');
  if (ctx.loading) throw new Error('useWorkspace: workspace aún cargando, usa useWorkspaceMaybe');
  if (ctx.error) throw ctx.error;
  if (ctx.notFound) throw new Error(`useWorkspace: recurso no encontrado (${ctx.notFound})`);
  if (ctx.forbidden) throw new Error(`useWorkspace: acceso denegado (status=${ctx.profileStatus})`);
  return ctx as WorkspaceContextValue;
}

export function useWorkspaceMaybe(): WorkspaceContextState {
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
