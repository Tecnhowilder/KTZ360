/**
 * mp-webhook — Edge Function Shelwi
 *
 * ZERO TRUST: El webhook de Mercado Pago NO es confiable por sí solo.
 * Siempre consultamos el pago directamente a la API de MP para validar.
 *
 * Los precios se validan contra la tabla `plans` en DB (no hardcodeados).
 *
 * Soporta:
 *   - Activación de plan regular (PRO/PREMIUM)
 *   - Activación de plan Founder (is_founder=true en external_reference)
 *   - Idempotencia via payment_events
 *   - Auditoría completa
 */
import { serve }        from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders }  from '../_shared/cors.ts';
import { logEdgeError } from '../_shared/errorLogger.ts';
import {
  isPlanCode,
  isBillingCycle,
  validatePaymentAmount,
} from '../_shared/plans.ts';

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
    // ── 1. Variables de entorno ───────────────────────────────────────────────
    const accessToken    = Deno.env.get('MP_ACCESS_TOKEN');
    const supabaseUrl    = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!accessToken)    throw new Error('MP_ACCESS_TOKEN missing');
    if (!supabaseUrl)    throw new Error('SUPABASE_URL missing');
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');

    // ── 2. Parsear notificación de MP ─────────────────────────────────────────
    const url = new URL(req.url);
    let paymentId: string | null = url.searchParams.get('id') || url.searchParams.get('data.id');
    let topic = url.searchParams.get('topic') || url.searchParams.get('type');

    if (req.method === 'POST') {
      try {
        const b = await req.json();
        topic     = b?.type || b?.topic || topic;
        paymentId = b?.data?.id ? String(b.data.id) : paymentId;
      } catch { /* body vacío o no-JSON */ }
    }

    if (topic !== 'payment' || !paymentId) {
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. VERIFICACIÓN: consultar pago directamente en MP (nunca confiar en webhook body) ──
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!mpRes.ok) {
      console.error(`[mp-webhook] MP payment fetch error: ${mpRes.status}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payment       = await mpRes.json();
    const paymentStatus = payment.status ?? 'unknown';
    const receivedAmount: number | null = payment.transaction_amount ?? null;
    const currency: string = payment.currency_id ?? 'COP';

    // ── 4. Parsear external_reference (creado por create-checkout, firmado por MP) ──
    let workspaceId:    string | null  = null;
    let userId:         string | null  = null;
    let planCode:       string | null  = null;
    let billingCycle:   string | null  = null;
    let isFounder:      boolean        = false;
    let founderPromoId: string | null  = null;
    let expectedAmount: number | null  = null;

    let productType:    string | null  = null;
    let licenseQty:     number | null  = null;
    let licenseUnit:    number | null  = null;

    try {
      const ref      = JSON.parse(payment.external_reference ?? '{}');
      workspaceId    = typeof ref.workspaceId    === 'string'  ? ref.workspaceId    : null;
      userId         = typeof ref.userId         === 'string'  ? ref.userId         : null;
      planCode       = typeof ref.planCode       === 'string'  ? ref.planCode       : null;
      billingCycle   = typeof ref.billingCycle   === 'string'  ? ref.billingCycle   : null;
      isFounder      = ref.isFounder             === true;
      founderPromoId = typeof ref.founderPromoId === 'string'  ? ref.founderPromoId : null;
      expectedAmount = typeof ref.expectedAmount === 'number'  ? ref.expectedAmount : null;
      productType    = typeof ref.productType    === 'string'  ? ref.productType    : null;
      licenseQty     = typeof ref.quantity       === 'number'  ? ref.quantity       : null;
      licenseUnit    = typeof ref.unitPrice      === 'number'  ? ref.unitPrice      : null;
    } catch {
      console.error('[mp-webhook] invalid external_reference');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── 5. Idempotencia: si ya procesamos este pago, salir ───────────────────
    const { data: inserted, error: insertError } = await supabase
      .from('payment_events')
      .insert({
        payment_id:    String(paymentId),
        workspace_id:  workspaceId,
        user_id:       userId,
        plan_code:     planCode,
        billing_cycle: billingCycle,
        status:        paymentStatus,
        amount:        receivedAmount,
        currency_code: currency,
        event_type:    'payment',
        payload:       payment,
      })
      .select('id')
      .maybeSingle();

    if (insertError && insertError.code !== '23505') throw insertError;
    const isNewEvent = !!inserted;

    // ── 6. Procesar SOLO si es nuevo evento aprobado con datos válidos ────────

    // ── BRANCH A: Licencias adicionales ──────────────────────────────────────
    if (
      isNewEvent &&
      paymentStatus === 'approved' &&
      productType   === 'additional_licenses' &&
      workspaceId   &&
      licenseQty    !== null
    ) {
      const qty       = licenseQty ?? 1;
      const unitPrice = licenseUnit ?? 11900;
      const total     = qty * unitPrice;

      // ── A1. IDEMPOTENCIA: si ya existe un registro con este payment_id → salir ──
      // MP puede reenviar el webhook varias veces. El UNIQUE INDEX en payment_id
      // también protege a nivel DB, pero comprobamos antes para no generar errores.
      const { data: existingLicense } = await supabase
        .from('additional_licenses')
        .select('id')
        .eq('payment_id', String(paymentId))
        .maybeSingle();

      if (existingLicense) {
        console.log(`[mp-webhook] additional_licenses already processed for payment ${paymentId} — skipping`);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── A2. Validar monto (tolerancia $500 COP por redondeo de MP) ────────────
      if (expectedAmount !== null && receivedAmount !== null) {
        const delta = Math.abs(receivedAmount - expectedAmount);
        if (delta > 500) {
          console.error(`[mp-webhook] ADDITIONAL_LICENSES PRICE MISMATCH: received ${receivedAmount}, expected ${expectedAmount}`);
          try { await supabase.from('audit_log').insert({
            workspace_id: workspaceId, user_id: userId,
            action: 'price_tampering_detected', entity_type: 'payment',
            metadata: { payment_id: paymentId, received_amount: receivedAmount, expected_amount: expectedAmount, product_type: 'additional_licenses' },
          }); } catch { /* audit log, non-critical */ }

          return new Response(JSON.stringify({ received: true, blocked: 'price_mismatch' }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── A3. Insertar con schema completo (historial inmutable) ────────────────
      // purchase_price guarda el precio VIGENTE al momento del pago.
      // Si en 2028 el precio sube a $14.900, esta fila sigue registrando $11.900.
      const mpPreferenceId = payment?.additional_info?.items?.[0]?.id ?? null;

      const { error: insertErr } = await supabase.from('additional_licenses').insert({
        workspace_id:     workspaceId,
        quantity:         qty,
        status:           'active',
        purchase_price:   unitPrice,      // precio histórico del momento del pago
        currency:         'COP',
        payment_id:       String(paymentId),
        mp_preference_id: mpPreferenceId,
        purchased_at:     new Date().toISOString(),
        activated_at:     new Date().toISOString(),
        expires_at:       null,           // null = permanente mientras la suscripción esté activa
        created_by:       userId,
      });

      if (insertErr && insertErr.code === '23505') {
        // Duplicado por UNIQUE(payment_id) — ya fue procesado por otra instancia del webhook
        console.log(`[mp-webhook] duplicate prevented by UNIQUE INDEX for payment ${paymentId}`);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (insertErr) throw insertErr;

      // ── A4. Auditoría ─────────────────────────────────────────────────────────
      try { await supabase.from('audit_log').insert({
        workspace_id: workspaceId, user_id: userId,
        action: 'additional_licenses_activated', entity_type: 'subscription',
        metadata: { payment_id: paymentId, quantity: qty, unit_price: unitPrice, total, currency: 'COP' },
      }); } catch { /* audit log, non-critical */ }

      console.log(`[mp-webhook] +${qty} additional licenses activated for workspace ${workspaceId} @ $${unitPrice} each`);

      return new Response(JSON.stringify({ received: true, processed: 'additional_licenses', quantity: qty }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── BRANCH B: Suscripción de plan (PRO / PREMIUM / ENTERPRISE) ────────────
    if (
      isNewEvent &&
      paymentStatus === 'approved' &&
      workspaceId &&
      isPlanCode(planCode) &&
      isBillingCycle(billingCycle)
    ) {
      // ── 6a. VALIDAR MONTO contra DB (no hardcodeado) ──────────────────────
      if (receivedAmount !== null) {
        const amountCheck = await validatePaymentAmount(
          supabaseUrl, serviceRoleKey,
          planCode, billingCycle, isFounder,
          receivedAmount,
        );

        if (!amountCheck.valid) {
          // Registrar alerta de price tampering (no bloquear — el pago ya fue procesado por MP)
          console.error(`[mp-webhook] PRICE TAMPERING ALERT: received ${amountCheck.received}, expected ${amountCheck.expected}, delta ${amountCheck.delta}`);
          try { await supabase.from('audit_log').insert({
            workspace_id: workspaceId,
            user_id:      userId,
            action:       'price_tampering_detected',
            entity_type:  'payment',
            metadata: {
              payment_id:      paymentId,
              received_amount: amountCheck.received,
              expected_amount: amountCheck.expected,
              delta:           amountCheck.delta,
              plan_code:       planCode,
              is_founder:      isFounder,
            },
          }); } catch { /* audit log, non-critical */ }

          // Si la diferencia es mayor a $500 COP (tolerancia de redondeo MP), no activar el plan
          if (amountCheck.delta > 500) {
            console.error('[mp-webhook] Plan activation BLOCKED due to price mismatch > $500');
            return new Response(JSON.stringify({ received: true, blocked: 'price_mismatch' }), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }

      // ── 6b. Obtener plan_id desde DB ──────────────────────────────────────
      const { data: plan } = await supabase
        .from('plans')
        .select('id, price')
        .eq('code', planCode)
        .maybeSingle();

      if (!plan) {
        console.error(`[mp-webhook] Plan "${planCode}" not found in DB`);
        return new Response(JSON.stringify({ received: true, error: 'plan_not_found' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── 6c. Actualizar suscripción ────────────────────────────────────────
      const subscriptionUpdate: Record<string, unknown> = {
        plan_id:                   plan.id,
        status:                    'active',
        billing_cycle:             billingCycle,
        provider:                  'mercadopago',
        provider_subscription_id:  String(paymentId),
        current_period_start:      new Date().toISOString(),
        current_period_end:        periodEndFrom(billingCycle),
        cancel_at_period_end:      false,
      };

      await supabase
        .from('subscriptions')
        .update(subscriptionUpdate)
        .eq('workspace_id', workspaceId);

      // ── 6d. Si es Founder, activar Founder Program ────────────────────────
      if (isFounder) {
        try {
          // Llamar RPC activate_founder_subscription (solo service_role puede)
          // La promo se identifica por plan_code + naming convention
          const promoName = planCode === 'pro' ? 'PRO Founder' : 'PREMIUM Founder';

          const { error: founderErr } = await supabase.rpc(
            'activate_founder_subscription',
            {
              p_workspace_id:   workspaceId,
              p_plan_code:      planCode,
              p_promotion_name: promoName,
            }
          );

          if (founderErr) {
            console.error('[mp-webhook] activate_founder_subscription error:', founderErr);
            // No bloquear — la suscripción ya fue activada, solo el founder flag falló
          } else {
            console.log(`[mp-webhook] Founder activated for workspace ${workspaceId} (${promoName})`);
          }
        } catch (founderEx) {
          console.error('[mp-webhook] Founder activation exception:', founderEx);
        }
      }

      // ── 6e. Auditoría del evento ──────────────────────────────────────────
      try { await supabase.from('audit_log').insert({
        workspace_id: workspaceId,
        user_id:      userId,
        action:       isFounder ? 'subscription_activated_founder' : 'subscription_activated',
        entity_type:  'subscription',
        metadata: {
          payment_id:      paymentId,
          plan_code:       planCode,
          billing_cycle:   billingCycle,
          is_founder:      isFounder,
          amount:          receivedAmount,
          founder_promo_id: founderPromoId,
        },
      }); } catch { /* audit log, non-critical */ }

      // ── 6f. Registrar factura SaaS pendiente en saas_invoices ────────────
      // No genera factura real — registra el pending para conciliación.
      // La factura real requiere configuración de cuenta Alegra de Shelwi (Sprint 20).
      if (receivedAmount && receivedAmount > 0) {
        try {
          await supabase.rpc('register_saas_invoice', {
            p_payment_event_id: String(paymentId),
            p_workspace_id:     workspaceId,
            p_user_id:          userId,
            p_plan_code:        planCode,
            p_billing_cycle:    billingCycle,
            p_amount:           receivedAmount,
            p_currency:         currency,
          });
        } catch (e) {
          console.error('[mp-webhook] register_saas_invoice error:', e);
        }
      }

      // ── 6g. Email de confirmación de pago al cliente ──────────────────────
      // Envía template 'payment_approved' via send-email Edge Function (Resend).
      // Falla silenciosamente para no bloquear la activación.
      try {
        const userEmail = payment.payer?.email ?? null;
        if (userEmail) {
          const planLabel = isFounder
            ? `${planCode.toUpperCase()} Founder`
            : planCode.toUpperCase();
          const cycleLabel = billingCycle === 'annual' ? 'Anual' : 'Mensual';
          const siteUrl   = Deno.env.get('SITE_URL') || 'https://app.shelwi.com';

          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method:  'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              template: 'payment_approved',
              to:       userEmail,
              data: {
                planName: `${planLabel} (${cycleLabel})`,
                amount:   `$${(receivedAmount ?? 0).toLocaleString('es-CO')} COP`,
                appUrl:   siteUrl,
              },
            }),
          });
          console.log(`[mp-webhook] Confirmation email sent to ${userEmail}`);
        }
      } catch (emailErr) {
        console.error('[mp-webhook] send-email error (non-blocking):', emailErr);
      }

      console.log(`[mp-webhook] Plan activated: workspace=${workspaceId} plan=${planCode} founder=${isFounder}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    logEdgeError('mp-webhook', error);
    // Siempre retornar 200 a MP para evitar reintentos infinitos
    return new Response(
      JSON.stringify({ received: true, error: String(error) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
