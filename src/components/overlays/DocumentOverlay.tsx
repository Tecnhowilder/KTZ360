import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUI } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useClients, useQuotesRaw } from '../../hooks/useQuotes';
import { deriveQuote, dueDate, followMessage, openWhats, advanceAmount } from '../../lib/calc';
import { computeDoc } from '../../lib/engine';
import { getOrCreateQuoteToken, registerQuoteEvent } from '../../services/publicPortal';
import { ProposalDocument } from '../documents/ProposalDocument';

export function DocumentOverlay() {
  const { docQuoteId, closeDocument } = useUI();
  const { company } = useWorkspace();
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

  if (!docQuoteId || !quote) return null;

  const d = deriveQuote(quote, client);
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
  const advance = advanceAmount(doc.total, d.cfg.advancePct);

  const quoteTitle = quote.title;
  const quoteId = quote.id;
  const verifyUrl = tokenQuery.data ? `${window.location.origin}/p/${tokenQuery.data}` : null;

  async function shareWa() {
    setSharing(true);
    try {
      const token = await getOrCreateQuoteToken(quoteId);
      registerQuoteEvent(token, 'proposal_sent').catch(() => {});
      const portalUrl = `${window.location.origin}/p/${token}`;
      openWhats(followMessage(d.clientName, quoteTitle, doc.total, company.name, portalUrl));
    } finally {
      setSharing(false);
    }
  }

  function print() {
    window.print();
  }

  return (
    <div id="brivia-doc-wrap" style={{ position: 'fixed', inset: 0, zIndex: 90, background: '#0F172A', display: 'flex', flexDirection: 'column' }}>
      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid #EEF2F7', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>{quote.quote_number}</div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={shareWa} disabled={sharing} style={{ border: 'none', background: '#22C55E', color: '#fff', fontWeight: 700, fontSize: 13, padding: '9px 15px', borderRadius: 11, cursor: sharing ? 'default' : 'pointer', opacity: sharing ? 0.7 : 1 }}>
            WhatsApp
          </button>
          <button onClick={print} style={{ border: '1.5px solid #E2E8F0', background: '#fff', color: '#0F172A', fontWeight: 700, fontSize: 13, padding: '9px 15px', borderRadius: 11, cursor: 'pointer' }}>
            Imprimir
          </button>
          <button onClick={closeDocument} style={{ width: 38, height: 38, borderRadius: 11, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 16, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      </div>

      <div id="brivia-doc-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <ProposalDocument
          quoteNumber={quote.quote_number}
          title={quote.title}
          location={quote.location}
          clientName={d.clientName}
          clientPhone={client?.phone}
          clientEmail={client?.email}
          clientMeta={client?.meta}
          issuedAt={new Date(quote.created_at)}
          due={due}
          doc={doc}
          cfg={d.cfg}
          company={company}
          advance={advance}
          verifyUrl={verifyUrl}
        />
      </div>
    </div>
  );
}
