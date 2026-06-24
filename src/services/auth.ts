import { supabase } from '../lib/supabaseClient';
// Sprint 22: getAppBaseUrl importado via DeepLinks

import { DeepLinks } from '../lib/deepLinks';

// ─── Session Security (Sprint 24) ────────────────────────────────────────────
// ZERO TRUST: device_id generado en cliente, persiste en localStorage.
// El backend (register_session) controla sesiones simultáneas según el plan.

const DEVICE_ID_KEY = 'shelwi_device_id';

export function getStoredDeviceId(): string | null {
  try { return localStorage.getItem(DEVICE_ID_KEY); } catch { return null; }
}

function clearSessionStorage(): void {
  // No eliminar device_id al logout — el dispositivo sigue siendo el mismo.
  // La sesión se invalida en active_sessions mediante register_session() en el próximo login.
}

export async function signUp(email: string, password: string, fullName: string, companyName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, company_name: companyName } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // Sprint 24: registro de sesión en active_sessions ocurre en WorkspaceProvider
  // (después de que workspace_id esté disponible desde el perfil cargado).
  return data;
}

export async function signOut() {
  try {
    await supabase.rpc('log_auth_event', { p_action: 'logout' });
    // Sprint 24: el device_id permanece para identificar el dispositivo.
    // La sesión se marca como revocada en el próximo check_session_valid() o
    // cuando WorkspaceProvider detecte que no hay sesión activa.
  } catch {
    // best-effort
  }

  clearSessionStorage();

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Sprint 22: getAppBaseUrl() retorna https://app.shelwi.com en native
    redirectTo: DeepLinks.resetPassword(),
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/**
 * Reenvía el email de confirmación de cuenta.
 * Rate limit: Supabase limita internamente (2/hora por defecto).
 * El frontend añade un cooldown adicional de 60s en localStorage.
 */
export async function resendConfirmationEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });
  if (error) throw error;
}

/** Clave localStorage para el cooldown de reenvío */
export const RESEND_COOLDOWN_KEY = 'shelwi_resend_last_at';
export const RESEND_COOLDOWN_MS  = 60_000; // 60 segundos

export function getResendCooldownRemaining(): number {
  try {
    const last = parseInt(localStorage.getItem(RESEND_COOLDOWN_KEY) ?? '0', 10);
    const elapsed = Date.now() - last;
    return Math.max(0, RESEND_COOLDOWN_MS - elapsed);
  } catch { return 0; }
}

export function markResendSent(): void {
  try { localStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now())); } catch { /* noop */ }
}
