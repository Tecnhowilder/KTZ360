import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Trash2, MoreVertical } from 'lucide-react';
import { useUI } from '../features/app/UIProvider';
import { useDerivedQuotes, useClients, useInvalidateClients } from '../hooks/useQuotes';
import { fmtM, daysAgo } from '../lib/calc';
import { deleteClient } from '../services/clients';
import { ClientFormModal } from '../components/clients/ClientFormModal';
import { useToast } from '../components/ui/Toast';
import type { Client } from '../lib/types';

export function Clientes() {
  const { openClientDetail } = useUI();
  const { quotes, isLoading: loadingQuotes } = useDerivedQuotes();
  const clientsQuery = useClients();
  const invalidate = useInvalidateClients();
  const { showToast } = useToast();

  const [showNew, setShowNew]             = useState(false);
  const [editClient, setEditClient]       = useState<Client | null>(null);
  const [menuOpenId, setMenuOpenId]       = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      invalidate();
      showToast('Cliente eliminado');
      setConfirmDeleteId(null);
    },
    onError: () => showToast('Error al eliminar el cliente'),
  });

  if (loadingQuotes || clientsQuery.isLoading || !clientsQuery.data) return null;

  const clientCards = clientsQuery.data.map((c) => {
    const qs = quotes.filter((q) => q.client_id === c.id);
    const total = qs.reduce((a, q) => a + q.calc.total, 0);
    const approved = qs.filter((q) => q.status === 'Aprobada').length;
    const last = qs.length ? Math.min(...qs.map((q) => daysAgo(q.created_at))) : null;
    const lastActivity = last === null ? 'Sin actividad' : last === 0 ? 'Hoy' : `Hace ${last} días`;
    return { ...c, count: qs.length, approved, totalFmt: fmtM(total), lastActivity };
  });

  const confirmClient = clientCards.find(c => c.id === confirmDeleteId);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px' }}>Clientes</h1>
        <button onClick={() => setShowNew(true)}
          style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px 17px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 17 }}>+</span> Nuevo cliente
        </button>
      </div>

      {/* Grid de clientes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 14 }}>
        {clientCards.map((c) => (
          <div key={c.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 20, position: 'relative' }}>
            {/* Menú 3 puntos */}
            <div style={{ position: 'absolute', top: 14, right: 14 }}>
              <button
                onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === c.id ? null : c.id); }}
                style={{ border: 'none', background: '#F8FAFC', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B' }}>
                <MoreVertical size={15} />
              </button>
              {menuOpenId === c.id && (
                <>
                  <div onClick={() => setMenuOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                  <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 10, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,.12)', overflow: 'hidden', minWidth: 140 }}>
                    <button onClick={e => { e.stopPropagation(); setEditClient(c as Client); setMenuOpenId(null); }}
                      style={menuItemStyle}>
                      <Pencil size={13} /> Editar
                    </button>
                    <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id); setMenuOpenId(null); }}
                      style={{ ...menuItemStyle, color: '#EF4444', borderTop: '1px solid #FEE2E2' }}>
                      <Trash2 size={13} /> Eliminar
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Card body */}
            <div onClick={() => openClientDetail(c.id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingRight: 32 }}>
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
          </div>
        ))}
        {clientCards.length === 0 && (
          <div style={{ gridColumn: '1/-1', background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 18, padding: 32, textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>
            Aún no tienes clientes registrados.
          </div>
        )}
      </div>

      {/* Modal nuevo */}
      {showNew && <ClientFormModal onClose={() => setShowNew(false)} />}

      {/* Modal editar */}
      {editClient && (
        <ClientFormModal
          editClient={editClient}
          onClose={() => setEditClient(null)}
        />
      )}

      {/* Modal confirmar eliminar */}
      {confirmDeleteId && confirmClient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => setConfirmDeleteId(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 24, maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', textAlign: 'center', marginBottom: 8 }}>¿Eliminar cliente?</div>
            <div style={{ fontSize: 13.5, color: '#64748B', textAlign: 'center', marginBottom: 20 }}>
              Vas a eliminar a <strong>{confirmClient.name}</strong>. Esta acción no se puede deshacer.
              {confirmClient.count > 0 && <div style={{ marginTop: 8, color: '#F59E0B', fontSize: 12.5 }}>Este cliente tiene {confirmClient.count} cotizaci{confirmClient.count === 1 ? 'ón' : 'ones'} asociadas.</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteId(null)}
                style={{ flex: 1, height: 46, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={() => deleteMut.mutate(confirmDeleteId)} disabled={deleteMut.isPending}
                style={{ flex: 1, height: 46, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 11, cursor: 'pointer', opacity: deleteMut.isPending ? .7 : 1, fontFamily: 'inherit' }}>
                {deleteMut.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', padding: '10px 14px',
  border: 'none', background: 'none',
  fontSize: 13.5, fontWeight: 500, color: '#0F172A',
  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
};
