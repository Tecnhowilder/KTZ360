/**
 * navigation.ts — NavigationService
 *
 * Única fuente de verdad para navegación por rol.
 * Usado en: InviteWizard, OnboardingPage, AppIndexRedirect, LoginPage.
 *
 * REGLA: NUNCA duplicar esta lógica en otros componentes.
 * Si un nuevo rol necesita destino diferente, agregarlo aquí únicamente.
 */

const ROLE_HOME: Record<string, string> = {
  owner:         '/app/dashboard',
  admin:         '/app/dashboard',
  supervisor:    '/app/dashboard',
  comercial:     '/app/clientes',
  operario:      '/app/pedidos',
  super_admin:   '/app/admin',
  support_admin: '/app/admin',
};

/**
 * Retorna la ruta home para un rol dado.
 * Fallback a '/app/dashboard' para roles desconocidos.
 */
export function getHomeForRole(role: string): string {
  return ROLE_HOME[role] ?? '/app/dashboard';
}

/**
 * Construye la ruta de navegación post-login.
 * Prioriza el redirect param si viene de un flujo de invitación.
 */
export function resolveLoginRedirect(role: string, redirectParam?: string | null): string {
  if (redirectParam && redirectParam.startsWith('/')) return redirectParam;
  return getHomeForRole(role);
}
