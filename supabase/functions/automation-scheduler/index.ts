/**
 * automation-scheduler — Edge Function Shelwi Sprint 13
 *
 * Ejecuta dos responsabilidades cada minuto:
 *   1. Procesa integration_events diferidos (execute_after <= now())
 *   2. Evalúa reglas periódicas (client_inactive, work_order_delayed)
 *
 * Configurar en Supabase Dashboard → Edge Functions → automation-scheduler → Schedule
 * Frecuencia: every minute  (*/1 * * * *)
 *
 * Zero Trust: siempre usa service_role. No acepta parámetros externos sensibles.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WORKER_URL       = `${SUPABASE_URL}/functions/v1/integration-worker`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);
  const results = { delayed_events_ready: 0, periodic_queued: 0, worker_called: false, errors: [] as string[] };

  try {
    // ── 1. Marcar eventos diferidos que ya llegó su hora ──────────────────────
    // Los integration_events con execute_after <= now() y status='pending'
    // se pueden procesar ahora. Simplemente los dejamos como 'pending' sin
    // execute_after para que el worker los recoja.
    const { data: readyEvents } = await admin
      .from('integration_events')
      .select('id')
      .eq('status', 'pending')
      .not('execute_after', 'is', null)
      .lte('execute_after', new Date().toISOString())
      .limit(100);

    results.delayed_events_ready = readyEvents?.length ?? 0;

    if (results.delayed_events_ready > 0) {
      // Re-evaluar condiciones para eventos diferidos que tienen condiciones
      // Esto lo hace el ShelwiInternalAdapter en el worker cuando ve conditions != []
      console.log(`[scheduler] ${results.delayed_events_ready} delayed events ready`);
    }

    // ── 2. Evaluar reglas periódicas (client_inactive, work_order_delayed) ────
    const { data: periodicResult, error: periodicErr } = await admin
      .rpc('evaluate_periodic_automations');

    if (periodicErr) {
      results.errors.push(`periodic: ${periodicErr.message}`);
    } else {
      results.periodic_queued = periodicResult as number ?? 0;
    }

    // ── 3. Cleanup periódico (1 vez al día, aproximadamente) ──────────────────
    const minute = new Date().getMinutes();
    if (minute === 0) {  // Al inicio de cada hora
      const hour = new Date().getHours();
      if (hour === 3) {  // A las 3 AM
        await admin.rpc('cleanup_automation_logs');
        await admin.rpc('cleanup_processed_integration_events');
        await admin.rpc('cleanup_expired_oauth_states');
        await admin.rpc('expire_overdue_quotes');
        console.log('[scheduler] Daily cleanup executed');
      }
    }

    // ── 4. Llamar al integration-worker si hay trabajo pendiente ──────────────
    const { count: pendingCount } = await admin
      .from('integration_events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .or(`execute_after.is.null,execute_after.lte.${new Date().toISOString()}`);

    if ((pendingCount ?? 0) > 0) {
      const workerResp = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SVC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: 'scheduler' }),
      });

      results.worker_called = true;
      if (!workerResp.ok) {
        results.errors.push(`worker: HTTP ${workerResp.status}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[automation-scheduler] Fatal:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err), results }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
