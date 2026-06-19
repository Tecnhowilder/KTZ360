import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShareBar } from '../ui/ShareBar';
import { useUI } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useClients, useQuotesRaw } from '../../hooks/useQuotes';
import { deriveQuote, dueDate, advanceAmount } from '../../lib/calc';
import { buildWhatsAppMessage, shareByEmail, copyLinkToClipboard } from '../../lib/shareUtils';
import { computeDoc } from '../../lib/engine';
import { getOrCreateQuoteToken, registerQuoteEvent } from '../../services/publicPortal';
import { listQuoteItems } from '../../services/quoteItems';
import { ProposalDocument, type UniversalItem, type UniversalLaborItem, type UniversalTotals } from '../documents/ProposalDocument';
import { usePdfTier, useFeatureAccess } from '../../hooks/usePermissions';
import type { QuoteSnapshot } from '../../lib/itemEngine';

export function DocumentOverlay() {
  const { docQuoteId, closeDocument } = useUI();
  const { company } = useWorkspace();
  const pdfTierQuery = usePdfTier();
  const qrAccess = useFeatureAccess('custom_qr_enabled');
  const clientsQuery = useClients();
  const rawQuery = useQuotesRaw();
  const [sharing, setSharing] = useState(false);

  const quote = rawQuery.data?.find((q) => q.id === docQuoteId);
  const client = clientsQuery.data?.find((c) => c.id === quote?.client_id);

  const tokenQuery = useQuery({
    queryKey: ['quoteToken', docQuoteId],
    queryFn: () => getOrCreateQuoteToken(docQuoteId!),
    enabled: !!docQuoteId,
  });

  // Leer quote_items (fuente primaria de verdad)
  const quoteItemsQuery = useQuery({
    queryKey: ['quoteItems', docQuoteId],
    queryFn: () => listQuoteItems(docQuoteId!),
    enabled: !!docQuoteId,
  });

  if (!docQuoteId || !quote) return null;

  const d = deriveQuote(quote, client);
  const due = dueDate(new Date(quote.created_at), d.cfg.validDays);
  const verifyUrl = qrAccess.data && tokenQuery.data ? `${window.location.origin}/p/${tokenQuery.data}` : null;

  // ── Fuente de datos: quote_items primero, snapshot_items como fallback ──────
  const snapshot = (quote as any).snapshot_items as QuoteSnapshot | undefined;
  const dbItems = quoteItemsQuery.data ?? [];

  // Construir universalItems desde quote_items BD (prioritario) o snapshot
  let universalItems: UniversalItem[] | undefined;
  let universalLaborItems: UniversalLaborItem[] | undefined;
  let universalTotals: UniversalTotals | undefined;

  if (dbItems.length > 0) {
    // Fuente principal: quote_items de BD
    universalItems = dbItems.map(it => ({
      id: it.id,
      item_name: it.item_name,
      description: it.description,
      quantity: Number(it.quantity),
      unit: it.unit,
      unit_price: Number(it.unit_price),
      subtotal: Number(it.subtotal),
    }));
    // Totales desde snapshot_items o calc_snapshot
    // Labor items desde snapshot
    if (snapshot?.labor_items?.length) {
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
    const totSrc = snapshot?.totals ?? (quote as any).calc_snapshot;
    universalTotals = {
      subtotal: Number(totSrc?.subtotal ?? 0),
      discount: Number(totSrc?.discount ?? 0),
      tax: Number(totSrc?.tax ?? 0),
      overhead: Number(totSrc?.overhead ?? 0),
      total: Number(totSrc?.total ?? 0),
      advance: Number(totSrc?.advance ?? 0),
      balance: Number(totSrc?.balance ?? 0),
      tax_rate: d.cfg.taxRate,
      discount_pct: d.cfg.discount,
    };
  } else if (snapshot?.items?.length) {
    // Fallback: snapshot_items
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
  }

  // Para cotizaciones legacy V1 (con service_lines), usar computeDoc
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

  // Advance: usar el valor del snapshot si es V2, si no calcular del doc
  const totalForAdvance = universalTotals?.total ?? doc.total;
  const advance = advanceAmount(totalForAdvance, d.cfg.advancePct);

  const shareParams = {
    clientName: d.clientName,
    projectName: quote?.title ?? '',
    companyName: company.name ?? '',
    publicUrl: '', // se completa al llamar
    total: universalTotals?.total ?? doc.total,
    phone: client?.phone ?? undefined,
    clientEmail: client?.email ?? undefined,
    quoteNumber: quote?.quote_number ?? undefined,
  };

  async function getPortalUrl() {
    const token = await getOrCreateQuoteToken(docQuoteId!);
    registerQuoteEvent(token, 'proposal_sent').catch(() => {});
    return `${window.location.origin}/p/${token}`;
  }

  async function shareWa() {
    setSharing(true);
    try {
      const url = await getPortalUrl();
      const msg = buildWhatsAppMessage({ ...shareParams, publicUrl: url });
      // navigator.share() en mobile (Android/iOS): selector nativo
      if (navigator.share) {
        try {
          await navigator.share({ title: shareParams.projectName, text: msg, url });
          return;
        } catch (e: unknown) {
          if ((e as Error)?.name === 'AbortError') return;
          // fallback a window.open
        }
      }
      const phone = (shareParams.phone ?? '').replace(/\D/g, '');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    } finally { setSharing(false); }
  }

  async function shareEmail() {
    setSharing(true);
    try {
      const url = await getPortalUrl();
      await shareByEmail({ ...shareParams, publicUrl: url });
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') { /* silencioso */ }
    } finally { setSharing(false); }
  }

  async function copyLink() {
    try {
      const url = await getPortalUrl();
      await copyLinkToClipboard({ ...shareParams, publicUrl: url });
    } catch { /* silencioso */ }
  }

  return (
    <div id="ktz-doc-wrap" style={{ position: 'fixed', inset: 0, zIndex: 90, background: '#0F172A', display: 'flex', flexDirection: 'column' }}>
      {/* Barra superior: número + cerrar */}
      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid #EEF2F7', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>{quote.quote_number}</div>
        <button onClick={closeDocument} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      {/* ShareBar integrada debajo del header */}
      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid #EEF2F7', padding: '12px 16px', flexShrink: 0 }}>
        <ShareBar
          onWhatsApp={shareWa}
          onEmail={shareEmail}
          onCopyLink={copyLink}
          onPDF={() => window.print()}
          disabled={sharing}
        />
      </div>

      <div id="ktz-doc-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 8px', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
        <style>{`
          #ktz-doc-scroll { scroll-snap-type: none; }
          @media (max-width: 767px) {
            #ktz-doc { transform: scale(0.97); transform-origin: top center; }
            #ktz-doc-scroll { padding: 8px 4px 24px; }
          }
        `}</style>
        <ProposalDocument
          quoteNumber={quote.quote_number}
          title={quote.title}
          location={quote.location}
          clientName={d.clientName}
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
          verifyUrl={verifyUrl}
          pdfTier={pdfTierQuery.data ?? 'free'}
          universalItems={universalItems}
          universalLaborItems={universalLaborItems}
          universalTotals={universalTotals}
          termsConditions={(() => {
            const fromQuote = Array.isArray((quote as any).terms_conditions) ? (quote as any).terms_conditions as string[] : [];
            const fromCompany = Array.isArray(company.terms_conditions) ? company.terms_conditions as unknown as string[] : [];
            return fromQuote.length > 0 ? fromQuote : fromCompany.length > 0 ? fromCompany : undefined;
          })()}
          status={quote.status}
        />
      </div>
    </div>
  );
}
