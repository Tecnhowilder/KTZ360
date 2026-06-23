/**
 * integrations.ts — Servicio de Integraciones Sprint 11
 * Zero Trust: workspace_id siempre del JWT en backend.
 */
import { supabase } from '../lib/supabaseClient';
import type { WhatsAppEventType } from './whatsapp';

export type IntegrationProvider =
  | 'whatsapp' | 'google_calendar' | 'outlook_calendar'
  | 'alegra' | 'gmail' | 'outlook_mail' | 'drive' | 'onedrive' | 'teams';

export type IntegrationStatus = 'connected' | 'disconnected' | 'pending' | 'error';

export interface Integration {
  id:           string;
  provider:     IntegrationProvider;
  enabled:      boolean;
  status:       IntegrationStatus;
  config:       Record<string, unknown>;
  connected_at: string | null;
  last_sync_at: string | null;
  last_error:   string | null;
}

export interface IntegrationEvent {
  id:           string;
  provider:     string;
  event_type:   string;
  status:       string;
  retries:      number;
  last_error:   string | null;
  created_at:   string;
  processed_at: string | null;
}

export interface IntegrationStatusResult {
  integrations: Integration[];
  recent_events: IntegrationEvent[];
}

// ─── Obtener estado de integraciones ─────────────────────────────────────────

export async function getIntegrationStatus(workspaceId: string): Promise<IntegrationStatusResult> {
  const { data, error } = await supabase.rpc('get_integration_status', {
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  const r = data as unknown as { ok: boolean; error?: string; integrations?: Integration[]; recent_events?: IntegrationEvent[] };
  if (!r.ok) throw new Error(r.error);
  return {
    integrations:   r.integrations ?? [],
    recent_events:  r.recent_events ?? [],
  };
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

export interface OAuthInitResult {
  state:          string;
  code_verifier:  string;
  nonce:          string;
  provider:       string;
  callback_url:   string;
}

// PKCE: SHA-256 del code_verifier → base64url
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function initiateOAuth(
  workspaceId: string,
  provider: 'google_calendar' | 'outlook_calendar' | 'drive' | 'onedrive' | 'teams',
  redirectTo?: string
): Promise<{ authorizationUrl: string }> {
  const { data, error } = await supabase.rpc('initiate_oauth', {
    p_workspace_id: workspaceId,
    p_provider:     provider,
    p_redirect_to:  redirectTo ?? '/app/config/integraciones',
  });
  if (error) throw error;
  const oauthData = data as unknown as OAuthInitResult & { ok: boolean; error?: string };
  if (!oauthData.ok) throw new Error(oauthData.error);

  const { state, code_verifier, callback_url } = oauthData;

  // Guardar verifier en sessionStorage (solo el frontend lo necesita)
  sessionStorage.setItem(`pkce_verifier_${state}`, code_verifier);

  // Generar code_challenge (SHA-256 del verifier)
  const codeChallenge = await generateCodeChallenge(code_verifier);

  // Obtener URL del Supabase project
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? '';
  const fullCallbackUrl = `${supabaseUrl}/${callback_url}?provider=${provider}`;

  // Construir URL de autorización del proveedor
  let authorizationUrl: string;

  // Scopes por proveedor: mínimo privilegio necesario
  const GOOGLE_SCOPES: Record<string, string> = {
    google_calendar: 'https://www.googleapis.com/auth/calendar.events',
    drive:           'https://www.googleapis.com/auth/drive.file',
  };
  const OUTLOOK_SCOPES: Record<string, string> = {
    outlook_calendar: 'Calendars.ReadWrite offline_access',
    outlook_mail:     'Mail.Send offline_access',
    onedrive:         'Files.ReadWrite offline_access',
    teams:            'ChannelMessage.Send offline_access',
  };

  if (provider === 'google_calendar' || provider === 'drive') {
    const params = new URLSearchParams({
      client_id:             import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
      redirect_uri:          fullCallbackUrl,
      response_type:         'code',
      scope:                 GOOGLE_SCOPES[provider] ?? '',
      access_type:           'offline',
      prompt:                'consent',
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    });
    authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  } else {
    const params = new URLSearchParams({
      client_id:             import.meta.env.VITE_OUTLOOK_CLIENT_ID ?? '',
      redirect_uri:          fullCallbackUrl,
      response_type:         'code',
      scope:                 OUTLOOK_SCOPES[provider] ?? 'offline_access',
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    });
    authorizationUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  return { authorizationUrl };
}

// ─── Desconectar ─────────────────────────────────────────────────────────────

export async function disconnectIntegration(
  workspaceId: string,
  provider: IntegrationProvider
): Promise<void> {
  const { data, error } = await supabase.rpc('disconnect_integration', {
    p_workspace_id: workspaceId,
    p_provider:     provider,
  });
  if (error) throw error;
  const dr = data as unknown as { ok: boolean; error?: string };
  if (!dr.ok) throw new Error(dr.error);
}

// ─── Configurar WhatsApp ──────────────────────────────────────────────────────

export interface WhatsAppConfig {
  phone_country_code?: string;
  templates: Partial<Record<WhatsAppEventType, boolean>>;
}

export async function configureWhatsApp(
  workspaceId: string,
  config: WhatsAppConfig
): Promise<void> {
  const { data, error } = await supabase.rpc('configure_whatsapp', {
    p_workspace_id: workspaceId,
    p_config:       config as never,
  });
  if (error) throw error;
  const r = data as unknown as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error);
}

// ─── Disparar worker (sync manual) ───────────────────────────────────────────

export async function triggerIntegrationWorker(workspaceId?: string): Promise<{
  processed: number; failed: number; skipped: number; total: number;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sin sesión activa');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const resp = await fetch(`${supabaseUrl}/functions/v1/integration-worker`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ workspace_id: workspaceId }),
  });

  if (!resp.ok) throw new Error('Error al ejecutar el worker');
  const result = await resp.json();
  return result.results ?? { processed: 0, failed: 0, skipped: 0, total: 0 };
}

// ─── Provider metadata ────────────────────────────────────────────────────────

// ─── Toggle auto_sync — persiste en backend, nunca en localStorage ───────────

export async function updateIntegrationAutoSync(
  workspaceId: string,
  provider: IntegrationProvider,
  autoSync: boolean
): Promise<void> {
  // Lee la config actual y solo modifica auto_sync
  const { data: statusData, error: statusErr } = await supabase.rpc('get_integration_status', {
    p_workspace_id: workspaceId,
  });
  if (statusErr) throw statusErr;

  const statusRes = statusData as unknown as { ok: boolean; integrations?: Array<{ provider: string; config: Record<string, unknown> }> };
  const existing = statusRes.integrations?.find(i => i.provider === provider);
  const newConfig = { ...(existing?.config ?? {}), auto_sync: autoSync };

  // Upsert la integración con la nueva config
  const { error } = await supabase
    .from('integrations')
    .update({ config: newConfig, updated_at: new Date().toISOString() } as never)
    .eq('workspace_id', workspaceId)
    .eq('provider', provider);
  if (error) throw error;
}

export const PROVIDER_META: Record<string, {
  label:       string;
  description: string;
  icon:        string;
  color:       string;
  bg:          string;
  category:    'messaging' | 'calendar' | 'accounting' | 'storage';
  available:   boolean;
  oauth:       boolean;
}> = {
  whatsapp: {
    label: 'WhatsApp', description: 'Notificaciones automáticas a clientes',
    icon: '💬', color: '#16A34A', bg: '#F0FDF4',
    category: 'messaging', available: true, oauth: false,
  },
  google_calendar: {
    label: 'Google Calendar', description: 'Sincronizar OTs, pedidos y seguimientos',
    icon: '📅', color: '#2563EB', bg: '#EFF6FF',
    category: 'calendar', available: true, oauth: true,
  },
  outlook_calendar: {
    label: 'Outlook Calendar', description: 'Sincronizar con Microsoft 365',
    icon: '📆', color: '#7C3AED', bg: '#F5F3FF',
    category: 'calendar', available: true, oauth: true,
  },
  alegra: {
    label: 'Alegra', description: 'Generar facturas desde pedidos finalizados',
    icon: '🧾', color: '#D97706', bg: '#FFFBEB',
    category: 'accounting', available: true, oauth: false,   // API Key, no OAuth
  },
  gmail: {
    label: 'Gmail', description: 'Enviar cotizaciones desde tu cuenta Gmail',
    icon: '✉️', color: '#EF4444', bg: '#FEF2F2',
    category: 'messaging', available: true, oauth: true,
  },
  outlook_mail: {
    label: 'Outlook Mail', description: 'Enviar cotizaciones desde Outlook / Microsoft 365',
    icon: '📧', color: '#7C3AED', bg: '#F5F3FF',
    category: 'messaging', available: true, oauth: true,
  },
  // Sprint 14 — Storage + Colaboración
  drive: {
    label: 'Google Drive', description: 'Respaldo y colaboración de evidencias en Drive',
    icon: '💾', color: '#1D6F42', bg: '#F0FDF4',
    category: 'storage', available: true, oauth: true,
  },
  onedrive: {
    label: 'OneDrive', description: 'Respaldo y colaboración de evidencias en OneDrive',
    icon: '☁️', color: '#0078D4', bg: '#EFF6FF',
    category: 'storage', available: true, oauth: true,
  },
  teams: {
    label: 'Microsoft Teams', description: 'Notificaciones de OTs y operaciones en Teams',
    icon: '👥', color: '#6264A7', bg: '#F5F3FF',
    category: 'messaging', available: true, oauth: true,
  },
};
