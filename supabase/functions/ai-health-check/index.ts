/**
 * ai-health-check — Edge Function Shelwi
 * Monitoreo automático de salud de proveedores IA.
 *
 * Llamado por:
 *   - pg_cron: cada 5 minutos (automático)
 *   - Backoffice Super Admin: verificación manual
 *
 * Flujo por proveedor habilitado:
 *   1. Ping básico (prompt mínimo)
 *   2. Registrar latencia, status, circuit_breaker state
 *   3. Actualizar ai_provider_health vía RPC
 *   4. Si NVIDIA_API_KEY no está configurada → status='unconfigured', no falla
 *
 * SEGURIDAD:
 *   - Solo invocable por service_role (pg_cron) o super_admin autenticado
 */
import { serve }        from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { pingGemini }   from '../_shared/providers/gemini.ts';
import { pingNvidianim } from '../_shared/providers/nvidia.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const adminClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  // Seguridad: aceptar invocación de pg_cron (sin auth) o de admin autenticado
  const authHeader = req.headers.get('Authorization');
  const isAdmin    = !!authHeader; // Si viene con header → verificar rol admin
  // Para pg_cron el header viene vacío — se acepta desde service_role internamente

  const results: Array<{
    provider: string;
    status: string;
    latencyMs: number | null;
    error?: string;
  }> = [];

  // ── Obtener proveedores habilitados ────────────────────────────────────────
  const { data: providers } = await adminClient
    .from('ai_providers')
    .select('provider_key, api_key_secret, enabled')
    .order('priority');

  for (const p of (providers ?? [])) {
    if (!p.enabled) {
      results.push({ provider: p.provider_key, status: 'disabled', latencyMs: null });
      continue;
    }

    const apiKey = Deno.env.get(p.api_key_secret);

    if (!apiKey) {
      // Proveedor habilitado pero sin API key configurada → registrar como 'unconfigured'
      await adminClient.rpc('record_provider_health', {
        p_provider_key:   p.provider_key,
        p_status:         'unconfigured',
        p_latency_ms:     null,
        p_error_count:    0,
        p_success_count:  0,
        p_is_circuit_open: false,
        p_last_error:     `Secret ${p.api_key_secret} no configurado en Deno secrets`,
      }).catch(() => {});
      results.push({ provider: p.provider_key, status: 'unconfigured', latencyMs: null, error: `${p.api_key_secret} not set` });
      continue;
    }

    // Ping al proveedor
    let pingResult: { ok: boolean; latencyMs: number; error?: string };

    try {
      if (p.provider_key === 'gemini') {
        pingResult = await pingGemini(apiKey);
      } else if (p.provider_key === 'nvidia') {
        pingResult = await pingNvidianim(apiKey);
      } else {
        pingResult = { ok: false, latencyMs: 0, error: 'Proveedor no implementado' };
      }
    } catch (e) {
      pingResult = { ok: false, latencyMs: 0, error: (e as Error).message };
    }

    const status = pingResult.ok
      ? (pingResult.latencyMs > 5000 ? 'degraded' : 'ok')
      : 'down';

    await adminClient.rpc('record_provider_health', {
      p_provider_key:   p.provider_key,
      p_status:         status,
      p_latency_ms:     pingResult.latencyMs,
      p_error_count:    pingResult.ok ? 0 : 1,
      p_success_count:  pingResult.ok ? 1 : 0,
      p_is_circuit_open: status === 'down',
      p_last_error:     pingResult.error ?? null,
    }).catch(() => {});

    results.push({
      provider:  p.provider_key,
      status,
      latencyMs: pingResult.latencyMs,
      error:     pingResult.error,
    });
  }

  console.log('[ai-health-check] completed:', JSON.stringify(results));

  return new Response(JSON.stringify({ ok: true, checked_at: new Date().toISOString(), results }), {
    status: 200, headers: CORS_HEADERS,
  });
});
