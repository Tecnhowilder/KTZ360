import { useQuery } from '@tanstack/react-query';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useClients, useDerivedQuotes } from '../../hooks/useQuotes';
import { fmt, fmtM, statusStyle, daysAgo, followMessage, openWhats } from '../../lib/calc';
import { getLatestClientConsent } from '../../services/events';
import { getOrCreateQuoteToken, registerQuoteEvent } from '../../services/publicPortal';

const CONSENT_BADGE: Record<string, { icon: string; label: string; c: string; b: string }> = {
  accepted: { icon: '🟢', label: 'Autorizado', c: '#15803D', b: '#F0FDF4' },
  pending: { icon: '🟡', label: 'Pendiente', c: '#92400E', b: '#FFFBEB' },
  rejected: { icon: '🔴', label: 'Rechazado', c: '#B91C1C', b: '#FEF2F2' },
};

export function ClientDetailOverlay() {
  const { detailClientId, closeClientDetail, openQuoteDetail, openQuoteFlow } = useUI();
  const { company } = useWorkspace();
  const clientsQuery = useClients();
  const { quotes } = useDerivedQuotes();

  const client = clientsQuery.data?.find((c) => c.id === detailClientId);

  const consentQuery = useQuery({
    queryKey: ['clientConsent', detailClientId],
    queryFn: () => getLatestClientConsent(detailClientId!),
    enabled: !!detailClientId,
  });

  if (!detailClientId) return null;
  if (!client) return null;

  const clQuotes = quotes.filter((q) => q.client_id === client.id);
  const total = clQuotes.reduce((a, q) => a + q.calc.total, 0);
  const approved = clQuotes.filter((q) => q.status === 'Aprobada').length;
  const lastDays = clQuotes.length ? Math.min(...clQuotes.map((q) => daysAgo(q.created_at))) : null;
  const lastActivity = lastDays === null ? 'Sin actividad' : lastDays === 0 ? 'Hoy' : `Hace ${lastDays}d`;

  const consent = consentQuery.data;
  const consentBadge = consent ? CONSENT_BADGE[consent.status] : null;

  function newQuote() {
    closeClientDetail();
    openQuoteFlow({ cfg: { ...defaultQConfig(company), clientId: client!.id } });
  }

  async function whatsapp() {
    const proj = clQuotes[0]?.title || 'tu proyecto';
    const totalForMsg = clQuotes[0]?.calc.total ?? 0;
    if (clQuotes[0]) {
      const token = await getOrCreateQuoteToken(clQuotes[0].id);
      registerQuoteEvent(token, 'proposal_sent').catch(() => {});
      const portalUrl = `${window.location.origin}/p/${token}`;
      openWhats(followMessage(client!.name, proj, totalForMsg, company.name, portalUrl));
    } else {
      openWhats(followMessage(client!.name, proj, totalForMsg, company.name));
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 81, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadein .2s ease' }}
      onClick={closeClientDetail}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#F8FAFC', width: '100%', maxWidth: 560, height: '92vh', borderRadius: '26px 26px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp .3s ease', boxShadow: '0 -10px 50px rgba(0,0,0,.3)' }}
      >
        <div style={{ background: '#fff', padding: '18px 20px 16px', borderBottom: '1px solid #EEF2F7', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
              {client.initial}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.4px' }}>{client.name}</div>
                {consentBadge && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: consentBadge.c, background: consentBadge.b, padding: '3px 9px', borderRadius: 99 }}>
                    {consentBadge.icon} {consentBadge.label}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                {client.phone && <div style={{ fontSize: 12.5, color: '#64748B' }}>📞 {client.phone}</div>}
                {client.email && <div style={{ fontSize: 12.5, color: '#64748B' }}>✉️ {client.email}</div>}
                {client.meta && <div style={{ fontSize: 12.5, color: '#64748B' }}>📍 {client.meta}</div>}
                {!client.phone && !client.email && !client.meta && <div style={{ fontSize: 12.5, color: '#64748B' }}>—</div>}
              </div>
            </div>
          </div>
          <button onClick={closeClientDetail} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 13 }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Cotizaciones</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{clQuotes.length}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 13 }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Total cotizado</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmtM(total)}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 13 }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Aprobadas</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{approved}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 13 }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Última actividad</div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{lastActivity}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 9 }}>Historial de cotizaciones</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {clQuotes.map((q) => {
              const ss = statusStyle(q.status);
              return (
                <button
                  key={q.id}
                  onClick={() => { closeClientDetail(); openQuoteDetail(q.id); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #E2E8F0', background: '#fff', borderRadius: 14, padding: 13, cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.title}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{q.dateLabel} · {fmt(q.calc.total)}</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: ss.c, background: ss.b, padding: '5px 11px', borderRadius: 99, flexShrink: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: ss.dot }} />
                    {q.status}
                  </span>
                </button>
              );
            })}
            {clQuotes.length === 0 && <div style={{ fontSize: 12.5, color: '#94A3B8' }}>Sin cotizaciones todavía.</div>}
          </div>
        </div>

        <div style={{ background: '#fff', borderTop: '1px solid #EEF2F7', padding: '14px 20px calc(14px + env(safe-area-inset-bottom))', display: 'flex', gap: 10 }}>
          {client.phone && (
            <button onClick={whatsapp} style={{ border: 'none', background: '#22C55E', color: '#fff', fontWeight: 700, fontSize: 14, padding: '14px 18px', borderRadius: 13, cursor: 'pointer' }}>
              WhatsApp
            </button>
          )}
          <button onClick={newQuote} style={{ flex: 1, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14.5, padding: 14, borderRadius: 13, cursor: 'pointer', boxShadow: '0 8px 18px -8px rgba(37,99,235,.6)' }}>
            + Nueva cotización para {client.name}
          </button>
        </div>
      </div>
    </div>
  );
}
