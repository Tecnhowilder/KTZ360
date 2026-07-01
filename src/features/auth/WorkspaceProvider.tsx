import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthProvider';
import { getProfile, getWorkspace, getCompanySettings, getCurrentPlanName } from '../../services/workspaces';
import type { Profile, Workspace, CompanySettings } from '../../lib/types';
import { supabase } from '../../lib/supabaseClient';

// ─── Tipos de estado del contexto ────────────────────────────────────────────
//
// Estados posibles, cada uno semánticamente distinto — nunca se ocultan unos
// a otros ni se colapsan en "loading":
//
//   loading   — queries en vuelo, aún no hay resultado
//   error     — excepción real (red, RLS que lanza, error inesperado)
//   notFound  — la query RESOLVIÓ correctamente pero la fila no existe
//               (maybeSingle() → null). Esto NO es una excepción: es un
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

// ─── WorkspaceProvider ────────────────────────────────────────────────────────

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Timeout de seguridad: nunca dejar spinner más de 15 segundos.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 15_000);
    return () => clearTimeout(t);
  }, []);

  // getProfile usa maybeSingle(): data === null es un resultado válido,
  // NO una excepción. profileQuery.isError solo es true ante un fallo real.
  const profileQuery = useQuery({
    queryKey:  ['profile', user?.id],
    queryFn:   () => getProfile(user!.id),
    enabled:   !!user,
    retry:     2,
    staleTime: 60_000,
  });

  const profile       = profileQuery.data ?? null;
  const workspaceId   = profile?.workspace_id;
  // Zero Trust: solo perfiles activos cuentan como sesión válida. Un perfil
  // invited/inactive/removed puede LEER su propia fila (profiles_select_own)
  // pero nunca debe registrar una sesión activa ni disparar lecturas del workspace.
  const profileActive = profile?.status === 'active';
  const sessionRegistered = useRef(false);

  // Sprint 24 D1: registrar sesión activa solo para perfiles activos.
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
      : /Mac/.test(ua) ? 'Mac'
      : /Windows/.test(ua) ? 'Windows'
      : 'Navegador';

    supabase.rpc('register_session' as never, {
      p_workspace_id: workspaceId,
      p_device_id:    deviceId,
      p_device_name:  deviceName,
      p_user_agent:   ua.slice(0, 500),
    } as never).then(() => {});
  }, [workspaceId, profileActive]);

  // workspace/company solo se consultan si el perfil existe Y está activo —
  // un perfil 'forbidden' nunca debe disparar lecturas adicionales del workspace.
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

  // Excepciones reales (red, permisos que lanzan, errores inesperados).
  // Nunca incluye "0 filas" — eso ahora resuelve a null, no a throw.
  const isError =
    profileQuery.isError ||
    workspaceQuery.isError ||
    companyQuery.isError ||
    planQuery.isError;

  const firstError =
    profileQuery.error ||
    workspaceQuery.error ||
    companyQuery.error ||
    planQuery.error;

  const value: WorkspaceContextState = (() => {
    // 0) Sin usuario autenticado: profileQuery queda `enabled:false` y nunca
    //    se ejecuta, por lo que isLoading/isSuccess permanecen ambos en false
    //    indefinidamente. Sin este guard explícito, el flujo cae en el
    //    fallback final `{ loading: true }` — el mismo bug de spinner
    //    infinito que esta refactorización corrige, para un caso distinto.
    //    En producción ProtectedRoute ya redirige a /login antes de montar
    //    este provider sin sesión, pero se cubre aquí por defensa en profundidad.
    if (!user) {
      return { loading: false, notFound: 'profile' };
    }

    // 1) Error real — no se oculta, no se reintenta infinitamente
    if (isError) {
      return { loading: false, error: (firstError as Error) ?? new Error('Error al cargar tu cuenta') };
    }

    // 2) Timeout de seguridad
    if (timedOut && isLoading) {
      return { loading: false, error: new Error('La carga tardó demasiado. Verifica tu conexión e intenta de nuevo.') };
    }

    // 3) Aún cargando
    if (isLoading) {
      return { loading: true };
    }

    // 4) profileQuery resolvió — distinguir ausencia (notFound) de
    //    presencia con status no activo (forbidden) de presencia activa.
    if (profileQuery.isSuccess) {
      if (profile === null) {
        // La query funcionó pero no hay fila — estado esperado, no excepción.
        return { loading: false, notFound: 'profile' };
      }

      if (!profileActive) {
        // Zero Trust: profiles_select_own permite leer la fila propia sin
        // importar el status, pero solo 'active' obtiene acceso a la app.
        return { loading: false, forbidden: true, profileStatus: profile.status };
      }

      // Perfil activo — verificar el resto de recursos
      if (workspaceQuery.isSuccess && workspaceQuery.data === null) {
        return { loading: false, notFound: 'workspace' };
      }
      if (companyQuery.isSuccess && companyQuery.data === null) {
        return { loading: false, notFound: 'company' };
      }

      if (workspaceQuery.data && companyQuery.data && planQuery.data) {
        return {
          profile,
          workspace: workspaceQuery.data,
          company:   companyQuery.data,
          planName:  planQuery.data,
          loading:   false,
        };
      }
    }

    // Fallback — aún resolviendo dependencias en cadena
    return { loading: true };
  })();

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

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
