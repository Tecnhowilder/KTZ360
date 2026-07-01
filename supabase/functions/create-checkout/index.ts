/**
 * create-checkout — Edge Function Shelwi
 *
 * ZERO TRUST: workspaceId NUNCA viene del body/frontend.
 * Se obtiene siempre desde JWT → profiles → workspace_id.
 *
 * Los PRECIOS se obtienen siempre desde la tabla `plans` en DB.
 * Ningún precio está hardcodeado en esta función.
 *
 * Soporta:
 *   - Checkout regular (PRO/PREMIUM mensual o anual)
 *   - Checkout Founder (PRO Founder / PREMIUM Founder con precio especial)
 */
import { serve }        from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders }  from '../_shared/cors.ts';
import {
  isPlanCode,
  isBillingCycle,
  PLAN_NAMES,
  resolvePrice,
} from '../_shared/plans.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // ── 1. Verificar variables de entorno ─────────────────────────────────────
    const accessToken    = Deno.env.get('MP_ACCESS_TOKEN');
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon   = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const siteUrl        = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'http://localhost:5174';

    if (!accessToken)    throw new Error('MP_ACCESS_TOKEN missing');
    if (!supabaseUrl)    throw new Error('SUPABASE_URL missing');
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');

    // ── 2. ZERO TRUST: verificar JWT y obtener workspace desde DB ─────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized', code: 'no_token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar usuario con el token enviado
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized', code: 'invalid_token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Obtener workspace_id desde DB (nunca desde el body)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('workspace_id, role')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile?.workspace_id) {
      return new Response(JSON.stringify({ error: 'workspace_not_found' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const workspaceId = profile.workspace_id;

    // ── 3. Parsear cuerpo ─────────────────────────────────────────────────────
    const body        = await req.json();
    const productType = body.productType ?? 'plan_subscription'; // 'plan_subscription' | 'additional_licenses'

    // ── BRANCH A: Compra de licencias de usuario adicionales ──────────────────
    if (productType === 'additional_licenses') {
      const quantity  = Number(body.quantity ?? 1);
      const unitPrice = 11900; // COP — precio oficial, ignoramos body.unitPrice por seguridad

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        return new Response(JSON.stringify({ error: 'quantity must be integer between 1 and 20' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verificar que el workspace tiene plan PREMIUM o ENTERPRISE
      const { data: planFeature } = await adminClient.rpc('check_feature_access', {
        p_workspace_id: workspaceId,
        p_feature:      'multiuser_enabled',
      });

      if (!planFeature) {
        return new Response(JSON.stringify({ error: 'Plan PREMIUM requerido para comprar usuarios adicionales' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const totalAmount = quantity * unitPrice;

      await adminClient.from('audit_log').insert({
        workspace_id: workspaceId, user_id: user.id,
        action: 'additional_licenses_checkout_initiated', entity_type: 'subscription',
        metadata: { quantity, unit_price: unitPrice, total: totalAmount },
      }).then(() => {}).catch(() => {});

      const externalReference = JSON.stringify({
        workspaceId,
        userId:         user.id,
        productType:    'additional_licenses',
        quantity,
        unitPrice,
        expectedAmount: totalAmount,
      });

      const preference = {
        items: [{
          id:          `additional-licenses-x${quantity}`,
          title:       `Shelwi — ${quantity} usuario${quantity > 1 ? 's' : ''} adicional${quantity > 1 ? 'es' : ''}`,
          description: `${quantity} cupo${quantity > 1 ? 's' : ''} adicional${quantity > 1 ? 'es' : ''} de usuario para tu equipo Shelwi`,
          quantity:    1,
          currency_id: 'COP',
          unit_price:  totalAmount,
        }],
        external_reference: externalReference,
        back_urls: {
          success: `${siteUrl}/app/team?payment=success`,
          pending: `${siteUrl}/app/team?payment=pending`,
          failure: `${siteUrl}/app/team/adicionales?payment=failed`,
        },
        notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
        metadata: { workspace_id: workspaceId, product_type: 'additional_licenses', quantity },
      };

      const mpRes  = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(preference),
      });
      const mpData = await mpRes.json();
      if (!mpRes.ok) throw new Error(`Mercado Pago error ${mpRes.status}: ${JSON.stringify(mpData)}`);

      return new Response(
        JSON.stringify({ preferenceId: mpData.id, initPoint: mpData.init_point, amount: totalAmount, currency: 'COP' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── BRANCH B: Suscripción de plan (PRO / PREMIUM / ENTERPRISE) ────────────
    const planCode    = body.planCode;
    const billingCycle = body.billingCycle;
    const isFounder   = body.isFounder === true;

    if (!isPlanCode(planCode)) {
      return new Response(JSON.stringify({ error: 'planCode must be "pro", "premium" or "enterprise"' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isBillingCycle(billingCycle)) {
      return new Response(JSON.stringify({ error: 'billingCycle must be "monthly" or "annual"' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. Resolver precio desde DB (nunca hardcodeado) ───────────────────────
    const resolved = await resolvePrice(supabaseUrl, serviceRoleKey, planCode, billingCycle, isFounder);

    // ── 5. Registrar auditoría del intento de checkout ────────────────────────
    await adminClient.from('audit_log').insert({
      workspace_id: workspaceId,
      user_id:      user.id,
      action:       'checkout_initiated',
      entity_type:  'subscription',
      metadata: {
        plan_code:    planCode,
        billing_cycle: billingCycle,
        is_founder:   isFounder,
        amount:       resolved.amount,
        currency:     resolved.currency,
      },
    }).then(() => {}).catch(() => {});

    // ── 6. Construir external_reference (firmado por MP, seguro) ─────────────
    const externalReference = JSON.stringify({
      workspaceId,
      userId:        user.id,
      planCode,
      billingCycle,
      isFounder,
      founderPromoId: resolved.founderPromoId ?? null,
      expectedAmount: resolved.amount,
    });

    // ── 7. Crear preferencia en Mercado Pago ──────────────────────────────────
    const cycleLabel = billingCycle === 'annual' ? 'Anual' : 'Mensual';
    const planLabel  = isFounder ? `${resolved.planName} Founder` : resolved.planName;

    const preference = {
      items: [{
        id:          `${planCode}-${billingCycle}${isFounder ? '-founder' : ''}`,
        title:       `Shelwi — Plan ${planLabel} (${cycleLabel})`,
        description: `Suscripción ${cycleLabel.toLowerCase()} al plan ${planLabel} de Shelwi`,
        quantity:    1,
        currency_id: resolved.currency,
        unit_price:  resolved.amount,
      }],
      external_reference: externalReference,
      back_urls: {
        success: `${siteUrl}/app/billing/success`,
        pending: `${siteUrl}/app/billing/pending`,
        failure: `${siteUrl}/app/billing/failure`,
      },
      notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
      metadata: {
        workspace_id: workspaceId,
        plan_code:    planCode,
        is_founder:   isFounder,
      },
    };

    const mpRes  = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(preference),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      console.error('[create-checkout] MP API error:', JSON.stringify(mpData));
      throw new Error(`Mercado Pago error ${mpRes.status}: ${JSON.stringify(mpData)}`);
    }

    return new Response(
      JSON.stringify({
        preferenceId:  mpData.id,
        initPoint:     mpData.init_point,
        amount:        resolved.amount,
        currency:      resolved.currency,
        isFounder:     isFounder,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('[create-checkout] error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
