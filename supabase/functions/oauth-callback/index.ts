/**
 * oauth-callback — Edge Function Shelwi Sprint 11
 * Handles OAuth redirects from Google Calendar and Outlook Calendar.
 *
 * ZERO TRUST:
 *   - Validates state + PKCE code_verifier
 *   - Exchanges code for tokens server-side
 *   - Encrypts tokens with AES-256-GCM (ENCRYPTION_KEY secret)
 *   - NEVER exposes tokens to frontend
 *
 * Flow:
 *   1. Provider redirects → /functions/v1/oauth-callback?code=...&state=...&provider=google
 *   2. Validate state against oauth_states table
 *   3. Exchange code for tokens (server-side)
 *   4. Encrypt tokens
 *   5. Store encrypted in integration_credentials
 *   6. Redirect to frontend success page
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY   = Deno.env.get('INTEGRATION_ENCRYPTION_KEY') ?? Deno.env.get('ENCRYPTION_KEY') ?? '';
const APP_URL          = Deno.env.get('APP_URL') ?? 'https://app.shelwi.com';

// ─── Encryption helpers (AES-256-GCM) ────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function encryptData(plaintext: string): Promise<{ encrypted: string; iv: string }> {
  if (!ENCRYPTION_KEY) throw new Error('INTEGRATION_ENCRYPTION_KEY not configured');

  const keyBytes = hexToBytes(ENCRYPTION_KEY.padEnd(64, '0').slice(0, 64));
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    encrypted: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

// ─── Token exchange helpers ───────────────────────────────────────────────────

async function exchangeGoogleCode(code: string, codeVerifier: string, redirectUri: string): Promise<Record<string, unknown>> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no configurados. Agregar en Supabase → Settings → Edge Functions → Secrets.');
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      code_verifier: codeVerifier,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  return resp.json();
}

async function exchangeOutlookCode(code: string, codeVerifier: string, redirectUri: string): Promise<Record<string, unknown>> {
  const clientId     = Deno.env.get('OUTLOOK_CLIENT_ID');
  const clientSecret = Deno.env.get('OUTLOOK_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('OUTLOOK_CLIENT_ID o OUTLOOK_CLIENT_SECRET no configurados.');
  }

  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      code_verifier: codeVerifier,
      scope:         'Calendars.ReadWrite offline_access',
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Outlook token exchange failed: ${err}`);
  }

  return resp.json();
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url      = new URL(req.url);
  const code     = url.searchParams.get('code');
  const state    = url.searchParams.get('state');
  const provider = url.searchParams.get('provider') ?? url.searchParams.get('scope')?.includes('calendar') ? 'google_calendar' : 'outlook_calendar';
  const error    = url.searchParams.get('error');

  const admin = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  // OAuth error from provider
  if (error) {
    console.error('[oauth-callback] Provider error:', error);
    return Response.redirect(`${APP_URL}/app/config/integraciones?error=${encodeURIComponent(error)}&provider=${provider}`);
  }

  if (!code || !state) {
    return Response.redirect(`${APP_URL}/app/config/integraciones?error=missing_params&provider=${provider}`);
  }

  try {
    // 1. Validate state + retrieve PKCE verifier
    const { data: stateRow, error: stateErr } = await admin
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateErr || !stateRow) {
      console.error('[oauth-callback] Invalid or expired state');
      return Response.redirect(`${APP_URL}/app/config/integraciones?error=invalid_state&provider=${provider}`);
    }

    const { workspace_id, code_verifier, redirect_to } = stateRow as Record<string, string>;
    const actualProvider = (stateRow as Record<string, string>).provider ?? provider;

    // 2. Delete state (one-time use)
    await admin.from('oauth_states').delete().eq('state', state);

    // 3. Build redirect URI (same URL that was registered in Google/Outlook)
    const redirectUri = `${SUPABASE_URL}/functions/v1/oauth-callback?provider=${actualProvider}`;

    // 4. Exchange code for tokens
    let tokens: Record<string, unknown>;
    if (actualProvider === 'google_calendar') {
      tokens = await exchangeGoogleCode(code, code_verifier, redirectUri);
    } else if (actualProvider === 'outlook_calendar') {
      tokens = await exchangeOutlookCode(code, code_verifier, redirectUri);
    } else {
      throw new Error(`Provider ${actualProvider} does not support OAuth`);
    }

    // 5. Encrypt tokens
    const tokenData = JSON.stringify({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type:    tokens.token_type,
      scope:         tokens.scope,
      expires_in:    tokens.expires_in,
      obtained_at:   new Date().toISOString(),
    });

    const { encrypted, iv } = await encryptData(tokenData);

    const expiresAt = new Date(Date.now() + ((tokens.expires_in as number ?? 3600) * 1000));

    // 6. Store encrypted credentials (service_role bypasses RLS deny policy)
    await admin.from('integration_credentials').upsert({
      workspace_id,
      provider: actualProvider,
      encrypted_data: encrypted,
      encryption_iv: iv,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,provider' });

    // 7. Update integration status → connected
    await admin.from('integrations').upsert({
      workspace_id,
      provider: actualProvider,
      enabled:      true,
      status:       'connected',
      connected_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'workspace_id,provider' });

    // 8. Audit log
    await admin.from('audit_log').insert({
      workspace_id,
      action: 'integration_connected',
      entity_type: 'integrations',
      metadata: { provider: actualProvider, scopes: tokens.scope },
    });

    // 9. Redirect to success
    const successUrl = redirect_to
      ? `${APP_URL}${redirect_to}?provider=${actualProvider}&status=connected`
      : `${APP_URL}/app/config/integraciones?provider=${actualProvider}&status=connected`;

    return Response.redirect(successUrl);

  } catch (err) {
    console.error('[oauth-callback] Error:', err);
    return Response.redirect(
      `${APP_URL}/app/config/integraciones?error=${encodeURIComponent(String(err))}&provider=${provider}`
    );
  }
});
