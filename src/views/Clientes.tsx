import { useState } from 'react';
import { useUI } from '../features/app/UIProvider';
import { useDerivedQuotes, useClients } from '../hooks/useQuotes';
import { fmtM, daysAgo } from '../lib/calc';
import { ClientFormModal } from '../components/clients/ClientFormModal';

export function Clientes() {
  const { openClientDetail } = useUI();
  const { quotes, isLoading: loadingQuotes } = useDerivedQuotes();
  const clientsQuery = useClients();
  const [showNew, setShowNew] = useState(false);

  if (loadingQuotes || clientsQuery.isLoading || !clientsQuery.data) return null;

  const clientCards = clientsQuery.data.map((c) => {
    const qs = quotes.filter((q) => q.client_id === c.id);
    const total = qs.reduce((a, q) => a + q.calc.total, 0);
    const approved = qs.filter((q) => q.status === 'Aprobada').length;
    const last = qs.length ? Math.min(...qs.map((q) => daysAgo(q.created_at))) : null;
    const lastActivity = last === null ? 'Sin actividad' : last === 0 ? 'Hoy' : `Hace ${last} días`;
    return { ...c, count: qs.length, approved, totalFmt: fmtM(total), lastActivity };
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px' }}>Clientes</h1>
        <button
          onClick={() => setShowNew(true)}
          style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px 17px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
        >
          <span style={{ fontSize: 17 }}>+</span> Nuevo cliente
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 14 }}>
        {clientCards.map((c) => (
          <div
            key={c.id}
            onClick={() => openClientDetail(c.id)}
            style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 20, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(150deg,#2563EB,#1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 17, flexShrink: 0 }}>
                {c.initial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Última actividad: {c.lastActivity}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{c.count}</div>
                <div style={{ fontSize: 10, color: '#64748B' }}>Cotizaciones</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#22C55E', fontVariantNumeric: 'tabular-nums' }}>{c.approved}</div>
                <div style={{ fontSize: 10, color: '#64748B' }}>Aprobadas</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{c.totalFmt}</div>
                <div style={{ fontSize: 10, color: '#64748B' }}>Cotizado</div>
              </div>
            </div>
          </div>
        ))}
        {clientCards.length === 0 && (
          <div style={{ gridColumn: '1/-1', background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 18, padding: 32, textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>
            Aún no tienes clientes registrados.
          </div>
        )}
      </div>

      {showNew && <ClientFormModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
