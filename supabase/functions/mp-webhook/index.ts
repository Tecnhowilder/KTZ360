import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/cors.ts';
import { isPlanCode, isBillingCycle, PLAN_PRICES } from '../_shared/plans.ts';

function periodEndFrom(billingCycle: 'monthly' | 'annual'): string {
  const now = new Date();
  if (billingCycle === 'annual') {
    now.setFullYear(now.getFullYear() + 1);
  } else {
    now.setMonth(now.getMonth() + 1);
  }
  return now.toISOString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!accessToken) throw new Error('MP_ACCESS_TOKEN missing');

    const url = new URL(req.url);
    let paymentId: string | null = url.searchParams.get('id') || url.searchParams.get('data.id');
    let topic = url.searchParams.get('topic') || url.searchParams.get('type');

    if (req.method === 'POST') {
      try {
        const b = await req.json();
        topic = b?.type || b?.topic || topic;
        paymentId = b?.data?.id ? String(b.data.id) : paymentId;
      } catch { /* body vacío o no-JSON */ }
    }

    if (topic !== 'payment' || !paymentId) {
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Consultar el pago directamente a MP para validar autenticidad
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!mpRes.ok) {
      console.error(`MP payment fetch error: ${mpRes.status}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payment = await mpRes.json();
    const status = payment.status ?? 'unknown';
    const amount: number | null = payment.transaction_amount ?? null;
    const currency: string = payment.currency_id ?? 'COP';

    let workspaceId: string | null = null;
    let userId: string | null = null;
    let planCode: string | null = null;
    let billingCycle: string | null = null;

    try {
      const ref = JSON.parse(payment.external_reference ?? '{}');
      workspaceId = typeof ref.workspaceId === 'string' ? ref.workspaceId : null;
      userId = typeof ref.userId === 'string' ? ref.userId : null;
      planCode = typeof ref.planCode === 'string' ? ref.planCode : null;
      billingCycle = typeof ref.billingCycle === 'string' ? ref.billingCycle : null;
    } catch { /* referencia inválida */ }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Idempotencia: unique(payment_id, status) — si ya existe, no duplicamos
    const { data: inserted, error: insertError } = await supabase
      .from('payment_events')
      .insert({
        payment_id: String(paymentId),
        workspace_id: workspaceId,
        user_id: userId,
        plan_code: planCode,
        billing_cycle: billingCycle,
        status,
        amount,
        currency_code: currency,
        event_type: 'payment',
        payload: payment,
      })
      .select('id')
      .maybeSingle();

    if (insertError && insertError.code !== '23505') throw insertError;

    const isNewEvent = !!inserted;

    if (isNewEvent && status === 'approved' && workspaceId && isPlanCode(planCode) && isBillingCycle(billingCycle)) {
      if (amount !== null && Math.round(amount) !== PLAN_PRICES[planCode][billingCycle]) {
        console.error(`Monto inesperado: recibido ${amount}, esperado ${PLAN_PRICES[planCode][billingCycle]}`);
      }

      const { data: plan } = await supabase.from('plans').select('id').eq('code', planCode).maybeSingle();
      if (plan) {
        await supabase
          .from('subscriptions')
          .update({
            plan_id: plan.id,
            status: 'active',
            billing_cycle: billingCycle,
            provider: 'mercadopago',
            provider_subscription_id: String(paymentId),
            current_period_start: new Date().toISOString(),
            current_period_end: periodEndFrom(billingCycle),
            cancel_at_period_end: false,
          })
          .eq('workspace_id', workspaceId);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('mp-webhook error:', error);
    return new Response(JSON.stringify({ received: true, error: String(error) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
