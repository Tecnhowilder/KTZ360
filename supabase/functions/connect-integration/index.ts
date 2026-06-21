/**
 * connect-integration — Edge Function Shelwi Sprint 12
 * Handles non-OAuth integrations that require credential validation before storing.
 *
 * Currently supports:
 *   - Alegra: validates API Key + email via Alegra API, then encrypts and stores
 *
 * Zero Trust:
 *   - workspace_id always from JWT (profiles table), never from request
 *   - credentials encrypted with AES-256-GCM before storing
 *   - Never returns plaintext credentials to frontend
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON    = Deno.env.get('SUPABASE_ANON_KEY')!;
const ENCRYPTION_KEY   = Deno.env.get('INTEGRATION_ENCRYPTION_KEY') ?? Deno.env.get('ENCRYPTION_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Encryption ───────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

async function encryptData(plaintext: string): Promise<{ encrypted: string; iv: string }> {
  if (!ENCRYPTION_KEY) throw new Error('INTEGRATION_ENCRYPTION_KEY not configured');
  const keyBytes = hexToBytes(ENCRYPTION_KEY.padEnd(64, '0').slice(0, 64));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(enc))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

// ─── Alegra validation ────────────────────────────────────────────────────────

const ALEGRA_BASE = 'https://app.alegra.com/api/r1';

async function validateAlegraCredentials(email: string, token: string): Promise<{
  valid: boolean;
  companyName?: string;
  error?: string;
}> {
  try {
    const auth = btoa(`${email}:${token}`);
    const resp = await fetch(`${ALEGRA_BASE}/company`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    });

    if (resp.status === 401 || resp.status === 403) {
      return { valid: false, error: 'Email o token de Alegra inválido. Verifica tus credenciales.' };
    }
    if (!resp.ok) {
      return { valid: false, error: `Error al conectar con Alegra: ${resp.status}` };
    }

    const company = await resp.json() as Record<string, unknown>;
    return { valid: true, companyName: company.name as string ?? 'Tu empresa en Alegra' };
  } catch (err) {
    return { valid: false, error: `Error de conexión con Alegra: ${String(err)}` };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  try {
    // 1. Verificar autenticación
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // 2. ZERO TRUST: workspace_id desde DB (nunca del cliente)
    const admin = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);
    const { data: profile } = await admin.from('profiles').select('workspace_id, role').eq('id', user.id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: 'profile_not_found' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // Solo owner/admin pueden conectar integraciones
    if (!['owner','admin','super_admin','support_admin'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'insufficient_permissions' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const workspaceId = profile.workspace_id;

    // 3. Parsear body
    const body = await req.json();
    const { provider, action } = body;

    if (provider === 'alegra' && action === 'connect') {
      const { alegra_email, alegra_token, auto_invoice } = body;

      if (!alegra_email || !alegra_token) {
        return new Response(JSON.stringify({ error: 'Se requieren alegra_email y alegra_token' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      // 4. Validar credenciales con Alegra API
      const validation = await validateAlegraCredentials(alegra_email, alegra_token);
      if (!validation.valid) {
        return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      // 5. Cifrar credenciales
      const tokenData = JSON.stringify({
        email:         alegra_email,
        api_token:     alegra_token,
        connected_at:  new Date().toISOString(),
        company_name:  validation.companyName,
      });
      const { encrypted, iv } = await encryptData(tokenData);

      // 6. Almacenar credenciales cifradas via RPC (service_role)
      const { error: storeErr } = await admin.rpc('store_alegra_credentials', {
        p_workspace_id:   workspaceId,
        p_encrypted_data: encrypted,
        p_encryption_iv:  iv,
        p_expires_at:     null,  // API keys no expiran
      });
      if (storeErr) throw storeErr;

      // 7. Guardar config de integración (auto_invoice, etc.)
      await admin.from('integrations').update({
        config: { auto_invoice: auto_invoice ?? false, company_name: validation.companyName },
        updated_at: new Date().toISOString(),
      } as never).eq('workspace_id', workspaceId).eq('provider', 'alegra');

      // 8. Audit log
      await admin.from('audit_log').insert({
        workspace_id: workspaceId,
        user_id:      user.id,
        action:       'integration_connected',
        entity_type:  'integrations',
        metadata:     { provider: 'alegra', method: 'api_key', company: validation.companyName },
      });

      return new Response(JSON.stringify({
        ok:           true,
        provider:     'alegra',
        status:       'connected',
        company_name: validation.companyName,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === 'test') {
      // Test connection without storing
      if (provider === 'alegra') {
        const { alegra_email, alegra_token } = body;
        const result = await validateAlegraCredentials(alegra_email ?? '', alegra_token ?? '');
        return new Response(JSON.stringify({ ok: result.valid, ...result }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: `Provider ${provider} o action ${action} no soportado` }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[connect-integration]', err);
    return new Response(JSON.stringify({ error: 'internal_error', message: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
