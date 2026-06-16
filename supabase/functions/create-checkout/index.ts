import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { PLAN_PRICES, PLAN_NAMES, isPlanCode, isBillingCycle } from '../_shared/plans.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
    console.log('[create-checkout] MP_ACCESS_TOKEN present:', !!accessToken);
    if (!accessToken) {
      throw new Error('MP_ACCESS_TOKEN missing');
    }

    const body = await req.json();
    const { workspaceId, userId, planCode, billingCycle } = body ?? {};
    console.log('[create-checkout] body received:', { workspaceId: !!workspaceId, planCode, billingCycle });

    if (typeof workspaceId !== 'string' || !workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isPlanCode(planCode)) {
      return new Response(JSON.stringify({ error: 'planCode must be "pro" or "premium"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isBillingCycle(billingCycle)) {
      return new Response(JSON.stringify({ error: 'billingCycle must be "monthly" or "annual"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amount = PLAN_PRICES[planCode][billingCycle];
    const planName = PLAN_NAMES[planCode];
    const cycleLabel = billingCycle === 'annual' ? 'Anual' : 'Mensual';
    const siteUrl = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'http://localhost:5174';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const externalReference = JSON.stringify({ workspaceId, userId: userId ?? null, planCode, billingCycle });

    const preference = {
      items: [
        {
          id: `${planCode}-${billingCycle}`,
          title: `KTZ360 — Plan ${planName} (${cycleLabel})`,
          description: `Suscripción ${cycleLabel.toLowerCase()} al plan ${planName} de KTZ360`,
          quantity: 1,
          currency_id: 'COP',
          unit_price: amount,
        },
      ],
      external_reference: externalReference,
      back_urls: {
        success: `${siteUrl}/app/billing/success`,
        pending: `${siteUrl}/app/billing/pending`,
        failure: `${siteUrl}/app/billing/failure`,
      },
      notification_url: supabaseUrl ? `${supabaseUrl}/functions/v1/mp-webhook` : undefined,
    };

    console.log('[create-checkout] calling MP API, siteUrl:', siteUrl, 'amount:', amount);
    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    });

    const mpData = await mpRes.json();

    console.log('[create-checkout] MP response status:', mpRes.status);
    if (!mpRes.ok) {
      console.error('[create-checkout] MP API error:', JSON.stringify(mpData));
      throw new Error(`Mercado Pago error ${mpRes.status}: ${JSON.stringify(mpData)}`);
    }

    return new Response(
      JSON.stringify({ preferenceId: mpData.id, initPoint: mpData.init_point }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('create-checkout error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
