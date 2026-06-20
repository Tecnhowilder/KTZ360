import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { deriveQuote, dueDate, advanceAmount, fmt } from '../../lib/calc';
import { computeDoc } from '../../lib/engine';
import { ProposalDocument, type UniversalItem, type UniversalLaborItem, type UniversalTotals } from '../../components/documents/ProposalDocument';
import { getPublicQuote, registerQuoteEvent, registerConsentAndEvent } from '../../services/publicPortal';
import { trackQuoteView } from '../../services/quoteViews';
import { supabase } from '../../lib/supabaseClient';
import { createNotification } from '../../services/notifications';
import { APP_NAME } from '../../lib/brand';
import type { CompanySettings } from '../../lib/types';
import type { QuoteSnapshot } from '../../lib/itemEngine';

const LEGAL_TEXT = (companyName: string) =>
  `${APP_NAME} actúa únicamente como plataforma tecnológica para la generación, gestión y envío de cotizaciones. Los datos personales son administrados por ${companyName}, quien actúa como responsable del tratamiento de los datos personales suministrados por el cliente.`;

type PendingAction = 'accepted' | 'rejected' | 'changes_requested' | null;

export function PublicQuotePortal() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const openedRef = useRef(false);
  const printedRef = useRef(false);

  const query = useQuery({
    queryKey: ['publicQuote', token],
    queryFn: () => getPublicQuote(token!),
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (query.data && token && !openedRef.current) {
      openedRef.current = true;
      const q = query.data.quote;
      const clientName = query.data.client?.name ?? 'El cliente';

      registerQuoteEvent(token, 'proposal_opened').catch(() => {});
      trackQuoteView(q.id).catch(() => {});

      // B2-D: Auto-cambiar estado a 'Vista' si estaba en 'Enviada'
      if (q.status === 'Enviada') {
        supabase.from('quotes')
          .update({ status: 'Vista' } as never)
          .eq('id', q.id)
          ;
      }

      // B3-B: Notificar al workspace que el cliente abrió la cotización
      createNotification(q.workspace_id, {
        title: `${clientName} abrió la cotización`,
        message: `${(q as any).quote_number ?? q.id} · ${q.title}`,
        type: 'info',
      }).catch(() => {});
    }
  }, [query.data, token]);

  useEffect(() => {
    if (query.data && token && searchParams.get('print') === '1' && !printedRef.current) {
      printedRef.current = true;
      registerQuoteEvent(token, 'proposal_downloaded').catch(() => {});
      setTimeout(() => window.print(), 400);
    }
  }, [query.data, token, searchParams]);

  if (!token) return null;

  if (query.isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 14 }}>
        Cargando propuesta…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#64748B' }}>
        <div style={{ fontSize: 32 }}>🔗</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Enlace no válido</div>
        <div style={{ fontSize: 13 }}>Esta propuesta ya no está disponible o el enlace es incorrecto.</div>
      </div>
    );
  }

  const { quote, client, company: companyRow, consent_status, pdf_tier, custom_qr_enabled } = query.data;
  const company: CompanySettings = {
    ...(companyRow as unknown as CompanySettings),
    terms_conditions: Array.isArray(companyRow?.terms_conditions) ? (companyRow!.terms_conditions as unknown as string[]) : [],
  };

  const d = deriveQuote(quote, client ?? undefined);
  const doc = computeDoc(d.cfg.serviceLines, {
    adminPct: d.cfg.adminPct,
    imprevistosPct: d.cfg.imprevistosPct,
    util: d.cfg.util,
    taxMode: d.cfg.taxMode,
    taxRate: d.cfg.taxRate,
    discount: d.cfg.discount,
    discountOn: d.cfg.discountOn,
    transportCost: d.cfg.transportCost,
    transportEnabled: d.cfg.transportEnabled,
  }, d.cfg.docDetailLevel);
  const due = dueDate(new Date(quote.created_at), d.cfg.validDays);

  // Leer items desde snapshot_items (cotizaciones V2)
  const snapshot = (quote as any).snapshot_items as QuoteSnapshot | undefined;

  let universalItems: UniversalItem[] | undefined;
  let universalLaborItems: UniversalLaborItem[] | undefined;
  let universalTotals: UniversalTotals | undefined;

  if (snapshot?.items?.length) {
    if (snapshot.labor_items?.length) {
      universalLaborItems = snapshot.labor_items.map((it, idx) => ({
        id: String(idx),
        item_name: it.item_name,
        description: it.description ?? null,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        subtotal: it.subtotal,
      }));
    }
    universalItems = snapshot.items.map((it, idx) => ({
      id: String(idx),
      item_name: it.item_name,
      description: it.description ?? null,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      subtotal: it.subtotal,
    }));
    universalTotals = {
      subtotal: snapshot.totals.subtotal,
      discount: snapshot.totals.discount,
      tax: snapshot.totals.tax,
      overhead: snapshot.totals.overhead ?? 0,
      total: snapshot.totals.total,
      advance: snapshot.totals.advance,
      balance: snapshot.totals.balance,
      labor_total: snapshot.totals.labor_total ?? 0,
      transport_cost: snapshot.totals.transport_cost ?? 0,
      tax_rate: snapshot.config?.tax_rate,
      discount_pct: snapshot.config?.discount_pct,
    };
  } else {
    // Fallback: leer de calc_snapshot (para cotizaciones sin snapshot_items)
    const cs = (quote as any).calc_snapshot;
    if (cs?.total > 0) {
      universalTotals = {
        subtotal: cs.subtotal ?? 0,
        discount: cs.discount ?? 0,
        tax: cs.tax ?? 0,
        overhead: 0,
        total: cs.total ?? 0,
        advance: cs.advance ?? 0,
        balance: cs.balance ?? 0,
      };
    }
  }

  const totalForAdvance = universalTotals?.total ?? doc.total;
  const advance = advanceAmount(totalForAdvance, d.cfg.advancePct);

  const eventMap: Record<Exclude<PendingAction, null>, 'proposal_accepted' | 'proposal_rejected' | 'proposal_changes_requested'> = {
    accepted: 'proposal_accepted',
    rejected: 'proposal_rejected',
    changes_requested: 'proposal_changes_requested',
  };

  const resultLabels: Record<Exclude<PendingAction, null>, string> = {
    accepted: '¡Gracias! Hemos registrado la aceptación de esta propuesta.',
    rejected: 'Hemos registrado el rechazo de esta propuesta.',
    changes_requested: 'Hemos registrado tu solicitud de cambios. Te contactaremos pronto.',
  };

  async function runAction(action: Exclude<PendingAction, null>) {
    const event = eventMap[action];
    if (action === 'accepted' || action === 'rejected') {
      await registerConsentAndEvent(token!, action, event);
    } else {
      await registerQuoteEvent(token!, event);
    }

    // B2-E / B2-F: Auto-actualizar status de la cotización
    const newStatus = action === 'accepted' ? 'Aprobada' : action === 'rejected' ? 'Rechazada' : null;
    if (newStatus) {
      supabase.from('quotes')
        .update({ status: newStatus, ...(action === 'accepted' ? { sent_at: new Date().toISOString() } : {}) } as never)
        .eq('id', quote.id)
        ;

      // B3-C / B3-D: Notificar al workspace
      const clientName = client?.name ?? 'El cliente';
      const qNum = (quote as any).quote_number ?? quote.id;
      createNotification(quote.workspace_id, {
        title: action === 'accepted'
          ? `✅ ${clientName} aprobó la cotización`
          : `❌ ${clientName} rechazó la cotización`,
        message: `${qNum} · ${quote.title}`,
        type: action === 'accepted' ? 'success' : 'danger',
      }).catch(() => {});
    }

    setResultMsg(resultLabels[action]);
    setPendingAction(null);
  }

  function onActionClick(action: Exclude<PendingAction, null>) {
    if (consent_status === 'accepted') {
      runAction(action);
    } else {
      setPendingAction(action);
      setConsentChecked(false);
    }
  }

  async function downloadPdf() {
    await registerQuoteEvent(token!, 'proposal_downloaded').catch(() => {});
    window.print();
  }

  // Open Graph meta tags dinámicos para preview en WhatsApp/LinkedIn
  const ogTitle   = `Propuesta: ${quote.title}`;
  const totalStr  = universalTotals?.total ? `$ ${Math.round(universalTotals.total).toLocaleString('es-CO')}` : '';
  const ogDesc    = [
    client?.name ? `Para: ${client.name}` : '',
    totalStr ? `Total: ${totalStr}` : '',
    company.name ? `De: ${company.name}` : '',
  ].filter(Boolean).join(' · ');
  const canonicalUrl = `${window.location.origin}/p/${token}`;

  return (
    <div id="ktz-doc-wrap" style={{ minHeight: '100vh', background: '#0F172A', padding: '24px 16px 100px' }}>
      {/* Meta tags Open Graph para preview social */}
      <title>{ogTitle}</title>
      {ogDesc && <meta name="description" content={ogDesc} />}
      <meta property="og:title" content={ogTitle} />
      {ogDesc && <meta property="og:description" content={ogDesc} />}
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={ogTitle} />
      {ogDesc && <meta name="twitter:description" content={ogDesc} />}
      <ProposalDocument
        quoteNumber={quote.quote_number}
        title={quote.title}
        location={quote.location}
        clientName={client?.name || 'Sin cliente'}
        clientPhone={client?.phone}
        clientEmail={client?.email}
        clientMeta={client?.meta}
        clientDocument={(client as any)?.document_number ?? null}
        clientAddress={(client as any)?.address ?? null}
        issuedAt={new Date(quote.created_at)}
        due={due}
        doc={doc}
        cfg={d.cfg}
        company={company}
        advance={advance}
        verifyUrl={custom_qr_enabled ? `${window.location.origin}/p/${token}` : null}
        pdfTier={pdf_tier}
        universalItems={universalItems}
        universalLaborItems={universalLaborItems}
        universalTotals={universalTotals}
        termsConditions={Array.isArray(quote.terms_conditions) ? (quote.terms_conditions as unknown as string[]) : undefined}
        status={quote.status}
      />

      {consent_status === 'accepted' && (
        <div style={{ maxWidth: 760, margin: '14px auto 0', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: 12, fontSize: 12.5, color: '#15803D', textAlign: 'center' }}>
          ✓ Tratamiento de datos previamente autorizado
        </div>
      )}

      {resultMsg && (
        <div style={{ maxWidth: 760, margin: '14px auto 0', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: 12, fontSize: 13, color: '#1E40AF', textAlign: 'center', fontWeight: 600 }}>
          {resultMsg}
        </div>
      )}

      <div className="no-print" style={{ maxWidth: 760, margin: '18px auto 0', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        <button onClick={downloadPdf} style={{ border: '1.5px solid #E2E8F0', background: '#fff', color: '#0F172A', fontWeight: 700, fontSize: 13.5, padding: '12px 18px', borderRadius: 12, cursor: 'pointer' }}>
          Descargar PDF
        </button>
        <button onClick={() => onActionClick('accepted')} style={{ border: 'none', background: '#22C55E', color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '12px 18px', borderRadius: 12, cursor: 'pointer' }}>
          Aceptar propuesta
        </button>
        <button onClick={() => onActionClick('rejected')} style={{ border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '12px 18px', borderRadius: 12, cursor: 'pointer' }}>
          Rechazar
        </button>
        <button onClick={() => onActionClick('changes_requested')} style={{ border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13.5, padding: '12px 18px', borderRadius: 12, cursor: 'pointer' }}>
          Solicitar cambios
        </button>
      </div>

      {pendingAction && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 22, maxWidth: 460, width: '100%' }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Autorización de tratamiento de datos</div>
            <p style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6, marginBottom: 14 }}>
              {LEGAL_TEXT(company.name || 'la empresa')}
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: '#0F172A', cursor: 'pointer', marginBottom: 16 }}>
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} style={{ width: 17, height: 17, marginTop: 1 }} />
              He leído y autorizo el tratamiento de mis datos personales conforme a lo anterior.
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setPendingAction(null)} style={{ flex: 1, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13.5, padding: 12, borderRadius: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => consentChecked && runAction(pendingAction)}
                disabled={!consentChecked}
                style={{ flex: 1, border: 'none', background: consentChecked ? '#2563EB' : '#CBD5E1', color: '#fff', fontWeight: 700, fontSize: 13.5, padding: 12, borderRadius: 12, cursor: consentChecked ? 'pointer' : 'not-allowed' }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="no-print" style={{ maxWidth: 760, margin: '20px auto 0', textAlign: 'center', fontSize: 11, color: '#475569' }}>
        Total: {fmt(doc.total)}
      </div>
    </div>
  );
}
