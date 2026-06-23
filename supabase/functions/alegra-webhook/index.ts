/**
 * alegra-webhook — Edge Function Shelwi
 *
 * Receptor de notificaciones de Alegra cuando cambia el estado de una factura.
 * URL a configurar en Alegra: https://<supabase-url>/functions/v1/alegra-webhook
 *
 * Zero Trust:
 *   - Verificar firma HMAC-SHA256 del webhook (header x-alegra-signature)
 *   - workspace_id SIEMPRE derivado de external_invoice_id → integration_invoices
 *   - Nunca confiar en workspace_id del body del webhook
 *
 * Eventos Alegra que procesamos:
 *   - invoice.updated: cambio de estado (paid, voided, overdue)
 *   - invoice.stamped: DIAN stamp exitoso (xml_url disponible)
 *   - payment.created: pago registrado en Alegra
 *
 * Si Alegra no envía webhooks (plan básico), usar sync_invoice_status() periódico.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-alegra-signature',
};

// Mapeo de eventos Alegra → estado en Shelwi
const ALEGRA_STATUS_MAP: Record<string, string> = {
  'paid':      'paid',
  'voided':    'void',
  'cancelled': 'cancelled',
  'overdue':   'overdue',
  'issued':    'issued',
  'draft':     'draft',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const WEBHOOK_SECRET   = Deno.env.get('ALEGRA_WEBHOOK_SECRET'); // Opcional si Alegra lo provee

  try {
    // ── 1. Parsear body ───────────────────────────────────────────────────────
    const rawBody = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ received: true, ignored: 'invalid_json' }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Verificar firma HMAC si está configurada ───────────────────────────
    if (WEBHOOK_SECRET) {
      const signature = req.headers.get('x-alegra-signature') ?? '';
      const encoder   = new TextEncoder();
      const key       = await crypto.subtle.importKey(
        'raw', encoder.encode(WEBHOOK_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign']
      );
      const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
      const expected = Array.from(new Uint8Array(mac))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      if (!signature || signature !== `sha256=${expected}`) {
        console.error('[alegra-webhook] Firma HMAC inválida');
        return new Response(JSON.stringify({ error: 'invalid_signature' }), {
          status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    const eventType = String(body.event ?? body.type ?? '');
    const data      = (body.data ?? body) as Record<string, unknown>;

    // ── 3. Procesar según tipo de evento ──────────────────────────────────────
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (eventType === 'invoice.updated' || eventType === 'invoice.stamped' ||
        eventType === 'payment.created' || !eventType) {

      const invoiceData   = (data.invoice ?? data) as Record<string, unknown>;
      const externalId    = String(invoiceData.id ?? '');
      const alegraStatus  = String(invoiceData.status ?? '');
      const pdfUrl        = String(invoiceData.url ?? invoiceData.pdf?.url ?? '');
      const xmlUrl        = String(invoiceData.stamp?.cufe ?? invoiceData.xml?.url ?? '');
      const paidDate      = invoiceData.paidAt ? new Date(invoiceData.paidAt as string).toISOString() : null;

      if (!externalId) {
        return new Response(JSON.stringify({ received: true, ignored: 'no_invoice_id' }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      const shelwiStatus = ALEGRA_STATUS_MAP[alegraStatus] ?? null;

      // Zero Trust: encontrar workspace_id desde la DB (nunca del body del webhook)
      const { data: invRow, error: invErr } = await admin
        .from('integration_invoices')
        .select('id, workspace_id, invoice_status')
        .eq('external_invoice_id', externalId)
        .eq('provider', 'alegra')
        .maybeSingle();

      if (invErr || !invRow) {
        console.warn(`[alegra-webhook] Factura ${externalId} no encontrada en Shelwi — evento ignorado`);
        return new Response(JSON.stringify({ received: true, ignored: 'invoice_not_found' }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }

      // Solo actualizar si hay cambio real de estado
      if (shelwiStatus && shelwiStatus !== invRow.invoice_status) {
        const { error: updateErr } = await admin.rpc('update_invoice_status', {
          p_workspace_id:        invRow.workspace_id,
          p_external_invoice_id: externalId,
          p_new_status:          shelwiStatus,
          p_pdf_url:             pdfUrl || null,
          p_xml_url:             xmlUrl || null,
          p_paid_at:             paidDate,
        });

        if (updateErr) {
          console.error('[alegra-webhook] Error al actualizar estado:', updateErr);
        } else {
          console.log(`[alegra-webhook] Factura ${externalId} → ${shelwiStatus} (workspace: ${invRow.workspace_id})`);
        }
      }

      // Si hay PDF/XML nuevos, actualizar aunque no cambie el estado
      if ((pdfUrl || xmlUrl) && (!pdfUrl || invRow.invoice_status === invRow.invoice_status)) {
        await admin.from('integration_invoices')
          .update({
            pdf_url:    pdfUrl || undefined,
            xml_url:    xmlUrl || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('external_invoice_id', externalId)
          .eq('provider', 'alegra');
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[alegra-webhook] Error:', error);
    // Siempre 200 para que Alegra no reintente indefinidamente
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
