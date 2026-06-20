import { useState } from 'react';
import { useWindowWidth, navModeFor } from '../hooks/useWindowWidth';
import { ClientesMobile } from '../components/clientes/ClientesMobile';
import { useMutation } from '@tanstack/react-query';
import {
  Search, Plus, ChevronRight, User, FileText, Clock, Phone,
  Pencil, Trash2, MoreVertical,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../features/app/UIProvider';
import { useClients, useInvalidateClients } from '../hooks/useQuotes';
import { deleteClient } from '../services/clients';
import { ClientFormModal } from '../components/clients/ClientFormModal';
import { useToast } from '../components/ui/Toast';
import type { Client } from '../lib/types';

const AVATAR_COLORS = [
  { bg: '#DBEAFE', fg: '#1D4ED8' }, { bg: '#D1FAE5', fg: '#065F46' },
  { bg: '#EDE9FE', fg: '#6D28D9' }, { bg: '#FEF3C7', fg: '#92400E' },
  { bg: '#FCE7F3', fg: '#9D174D' }, { bg: '#CCFBF1', fg: '#115E59' },
];
const avColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

export function Clientes() {
  const width   = useWindowWidth();
  const navMode = navModeFor(width);
  if (navMode === 'bottom') return <ClientesMobile />;
  return <ClientesDesktop />;
}

function ClientesDesktop() {
  const navigate   = useNavigate();
  const { openClientDetail } = useUI();
  const clientsQ   = useClients();
  const invalidate = useInvalidateClients();
  const { showToast } = useToast();

  const [search,        setSearch]        = useState('');
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [showNew,       setShowNew]       = useState(false);
  const [editClient,    setEditClient]    = useState<Client | null>(null);
  const [confirmDel,    setConfirmDel]    = useState<Client | null>(null);
  const [menuOpenId,    setMenuOpenId]    = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      invalidate();
      showToast('Cliente eliminado');
      setConfirmDel(null);
      setExpandedId(null);
    },
    onError: () => showToast('Error al eliminar'),
  });

  if (clientsQ.isLoading || !clientsQ.data) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94A3B8', fontSize: 14 }}>Cargando...</div>
      </div>
    );
  }

  const filtered = clientsQ.data.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id);
    setMenuOpenId(null);
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #F1F5F9',
        padding: '16px 16px 0', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Clientes</h1>
          <button
            onClick={() => setShowNew(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              border: 'none', background: '#2563EB', color: '#fff',
              fontWeight: 700, fontSize: 14, padding: '10px 18px',
              borderRadius: 12, cursor: 'pointer',
            }}
          >
            <Plus size={16} strokeWidth={2.5} /> Nuevo cliente
          </button>
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="search"
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', height: 42, border: '1px solid #E2E8F0',
              borderRadius: 12, paddingLeft: 36, fontSize: 14.5,
              outline: 'none', background: '#F8FAFC', color: '#0F172A',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Lista de clientes — acordeón */}
      <div style={{ padding: '8px 0', background: '#fff', marginTop: 6 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>👥</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
              {search ? 'Sin resultados' : 'No hay clientes aún'}
            </div>
            <div style={{ fontSize: 13.5, color: '#64748B' }}>
              {search ? 'Prueba con otro término' : 'Agrega tu primer cliente para empezar'}
            </div>
          </div>
        )}

        {filtered.map((c, idx) => {
          const isExpanded = expandedId === c.id;
          const av = avColor(c.name);

          return (
            <div
              key={c.id}
              style={{
                borderBottom: idx < filtered.length - 1 ? '1px solid #F8FAFC' : 'none',
                transition: 'background .1s',
              }}
            >
              {/* Fila colapsada — siempre visible */}
              <div
                onClick={() => toggle(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 16px', cursor: 'pointer',
                  background: isExpanded ? '#FAFBFF' : '#fff',
                  transition: 'background .15s',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 42, height: 42, borderRadius: 13,
                  background: av.bg, color: av.fg,
                  fontWeight: 800, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, letterSpacing: '-.3px',
                }}>
                  {initials(c.name)}
                </div>

                {/* Nombre */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 700, color: '#0F172A',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.name}
                  </div>
                  {c.phone && (
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>{c.phone}</div>
                  )}
                </div>

                {/* Menú 3 puntos */}
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
                    style={{
                      width: 30, height: 30, borderRadius: 8, border: 'none',
                      background: 'transparent', cursor: 'pointer', color: '#94A3B8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <MoreVertical size={15} />
                  </button>
                  {menuOpenId === c.id && (
                    <>
                      <div onClick={() => setMenuOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                      <div style={{
                        position: 'absolute', right: 0, top: 34, zIndex: 10,
                        background: '#fff', border: '1px solid #E2E8F0',
                        borderRadius: 12, boxShadow: '0 8px 24px rgba(15,23,42,.12)',
                        overflow: 'hidden', minWidth: 140,
                      }}>
                        <button
                          onClick={() => { setEditClient(c); setMenuOpenId(null); }}
                          style={mIS}>
                          <Pencil size={13} /> Editar
                        </button>
                        <button
                          onClick={() => { setConfirmDel(c); setMenuOpenId(null); }}
                          style={{ ...mIS, color: '#EF4444', borderTop: '1px solid #FEE2E2' }}>
                          <Trash2 size={13} /> Eliminar
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Chevron rotado */}
                <ChevronRight
                  size={18}
                  color="#CBD5E1"
                  style={{
                    flexShrink: 0,
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 250ms ease',
                  }}
                />
              </div>

              {/* Acciones expandidas — acordeón */}
              <div style={{
                overflow: 'hidden',
                maxHeight: isExpanded ? 120 : 0,
                opacity: isExpanded ? 1 : 0,
                transition: 'max-height 250ms ease, opacity 200ms ease',
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
                  padding: '8px 8px 14px', gap: 4,
                  background: '#FAFBFF',
                  borderTop: isExpanded ? '1px solid #F1F5F9' : 'none',
                }}>
                  {[
                    {
                      icon: <User size={20} strokeWidth={1.6} />,
                      label: 'Ver perfil',
                      color: '#2563EB',
                      action: () => openClientDetail(c.id),
                    },
                    {
                      icon: <FileText size={20} strokeWidth={1.6} />,
                      label: 'Nueva cotiz.',
                      color: '#7C3AED',
                      action: () => navigate('/app/cotizaciones/nueva'),
                    },
                    {
                      icon: <Clock size={20} strokeWidth={1.6} />,
                      label: 'Historial',
                      color: '#0891B2',
                      action: () => openClientDetail(c.id),
                    },
                    {
                      icon: <Phone size={20} strokeWidth={1.6} />,
                      label: 'Contactar',
                      color: '#16A34A',
                      action: () => {
                        if (c.phone) window.open(`tel:${c.phone}`, '_self');
                        else showToast('Este cliente no tiene teléfono registrado');
                      },
                    },
                  ].map(({ icon, label, color, action }) => (
                    <button
                      key={label}
                      onClick={e => { e.stopPropagation(); action(); }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 6,
                        padding: '10px 6px', border: 'none', background: 'none',
                        cursor: 'pointer', borderRadius: 12, color,
                        fontFamily: 'inherit',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span style={{ lineHeight: 0 }}>{icon}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: '#475569', textAlign: 'center', lineHeight: 1.2 }}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal nuevo cliente */}
      {showNew && <ClientFormModal onClose={() => setShowNew(false)} />}

      {/* Modal editar cliente */}
      {editClient && (
        <ClientFormModal
          editClient={editClient}
          onClose={() => setEditClient(null)}
        />
      )}

      {/* Confirmar eliminar */}
      {confirmDel && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => setConfirmDel(null)}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 24, maxWidth: 380, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
              ¿Eliminar a {confirmDel.name}?
            </div>
            <div style={{ fontSize: 13.5, color: '#64748B', marginBottom: 20 }}>
              Esta acción no se puede deshacer.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmDel(null)}
                style={{ flex: 1, height: 46, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button
                onClick={() => deleteMut.mutate(confirmDel.id)}
                disabled={deleteMut.isPending}
                style={{ flex: 1, height: 46, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 11, cursor: 'pointer', opacity: deleteMut.isPending ? .7 : 1, fontFamily: 'inherit' }}>
                {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const mIS: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', padding: '10px 14px',
  border: 'none', background: 'none',
  fontSize: 13.5, fontWeight: 500, color: '#0F172A',
  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
};
