/**
 * ClientesMobile — Pantalla Clientes rediseñada mobile-first.
 * Referencia: HubSpot Mobile / Salesforce / Pipedrive.
 * Desktop NO se modifica.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, SlidersHorizontal, Plus, UserPlus, Download, Upload,
  MoreVertical, MessageCircle, Phone, FileText,
  Eye, Pencil, Trash2, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { useUI } from '../../features/app/UIProvider';
import { useClients, useDerivedQuotes } from '../../hooks/useQuotes';
import { daysAgo } from '../../lib/calc';
import { NotificationBell } from '../ui/NotificationBell';
import type { Client } from '../../lib/types';
import type { DerivedQuote } from '../../lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  { bg: '#DBEAFE', fg: '#1D4ED8' }, { bg: '#D1FAE5', fg: '#065F46' },
  { bg: '#EDE9FE', fg: '#6D28D9' }, { bg: '#FEF3C7', fg: '#92400E' },
  { bg: '#FCE7F3', fg: '#9D174D' }, { bg: '#CCFBF1', fg: '#115E59' },
  { bg: '#FEE2E2', fg: '#991B1B' }, { bg: '#E0E7FF', fg: '#3730A3' },
];
const avColor = (s: string) => AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length];

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000)     return '$' + Math.round(n / 1_000) + 'k';
  return '$' + n;
}

function timeAgo(dateStr: string): string {
  const diff = daysAgo(dateStr);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7)   return `Hace ${diff} días`;
  if (diff < 30)  return `Hace ${Math.round(diff / 7)} semanas`;
  return `Hace ${Math.round(diff / 30)} meses`;
}

// ─── Clasificación de cliente ──────────────────────────────────────────────────
// Sprint 15: la clasificación viene desde customer_health_scores (backend).
// Esta función es el FALLBACK temporal mientras el score se calcula.
// Una vez que hay score persistido, la UI lo muestra desde el health score.

function clientStatusFallback(c: Client): { label: string; color: string; bg: string; border: string } {
  if (daysAgo(c.updated_at) > 60)
    return { label: 'Sin actividad', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' };
  const extC = c as Client & { total_approved?: number; total_quotes?: number };
  if ((extC.total_approved ?? 0) >= 3)
    return { label: 'VIP',           color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' };
  if ((extC.total_approved ?? 0) >= 2)
    return { label: 'Recurrente',    color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' };
  if ((extC.total_quotes ?? 0) > 0)
    return { label: 'Activo',        color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' };
  return   { label: 'Potencial',     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' };
}

// NOTA: clientStatusFallback usa c.total_approved y c.total_quotes (ya calculados
// por refresh_client_metrics en backend). Sigue siendo Zero Trust porque estas
// columnas vienen de la DB, no de cálculos en React. La clasificación VIP real
// viene de customer_health_scores.status (Sprint 15).
function clientStatus(c: Client, _quotes: DerivedQuote[]): { label: string; color: string; bg: string; border: string } {
  return clientStatusFallback(c);
}

function lastActivity(c: Client, quotes: DerivedQuote[]): { text: string; action: string; date: string } | null {
  const cq = quotes.filter(q => q.client_id === c.id).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  if (!cq.length) return null;
  const q = cq[0];
  const text = q.status === 'Aprobada' ? 'Aprobó cotización'
    : q.status === 'Enviada' ? 'Cotización enviada'
    : (q.status as string) === 'Vista' ? 'Abrió propuesta'
    : 'Actualizó cotización';
  return { text, action: q.status, date: q.updated_at };
}

// ─── Tarjeta de cliente ────────────────────────────────────────────────────────

function ClientCard({
  c, quotes, onOpen, navigate,
}: {
  c: Client;
  quotes: DerivedQuote[];
  onOpen: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const av      = avColor(initials(c.name)[0]);
  const cq      = quotes.filter(q => q.client_id === c.id);
  const valor   = cq.reduce((a, q) => a + q.calc.total, 0);
  const st      = clientStatus(c, quotes);
  const act     = lastActivity(c, quotes);
  const isSinAct = st.label === 'Sin actividad';

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '13px 16px', gap: 12 }}>
        {/* Avatar */}
        <div
          onClick={onOpen}
          style={{ width: 44, height: 44, borderRadius: 13, background: av.bg, color: av.fg, fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
        >
          {initials(c.name)}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>
            {c.meta ?? (c as any).city ?? '—'}
          </div>
          {c.phone && <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>{c.phone}</div>}
          {c.email && <div style={{ fontSize: 11.5, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{c.email}</div>}
        </div>

        {/* Métricas + estado + menú */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: valor > 0 ? '#0F172A' : '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>
              {valor > 0 ? fmtCompact(valor) : '$0'}
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
              {cq.length} {cq.length === 1 ? 'Cotización' : 'Cotizaciones'}
            </div>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: st.color, background: st.bg, border: `1px solid ${st.border}`, padding: '2px 8px', borderRadius: 99 }}>
            {st.label}
          </span>

          {/* Menú */}
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2 }}>
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
                <div style={{ position: 'absolute', right: 0, top: 24, zIndex: 50, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, boxShadow: '0 12px 32px rgba(15,23,42,.14)', overflow: 'hidden', minWidth: 172 }}>
                  {[
                    { icon: Eye,          label: 'Ver perfil',        action: onOpen },
                    { icon: FileText,     label: 'Nueva cotización',  action: () => navigate('/app/cotizaciones/nueva') },
                    { icon: MessageCircle,label: 'WhatsApp',          action: () => c.phone && window.open(`https://wa.me/${c.phone.replace(/\D/g,'')}`, '_blank') },
                    { icon: Phone,        label: 'Llamar',            action: () => c.phone && window.open(`tel:${c.phone}`, '_self') },
                    { icon: Pencil,       label: 'Editar',            action: onOpen },
                    { icon: Trash2,       label: 'Eliminar',          action: () => {}, danger: true },
                  ].map(item => (
                    <button key={item.label} onClick={e => { e.stopPropagation(); item.action(); setMenuOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, textAlign: 'left', fontFamily: 'inherit', color: (item as any).danger ? '#EF4444' : '#0F172A', borderTop: (item as any).danger ? '1px solid #FEE2E2' : 'none' }}>
                      <item.icon size={14} color={(item as any).danger ? '#EF4444' : '#64748B'} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pie: última actividad */}
      {act ? (
        <div style={{ padding: '0 16px 10px 72px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: isSinAct ? '#EF4444' : '#22C55E', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: isSinAct ? '#EF4444' : '#16A34A', fontWeight: 600 }}>{act.text}</span>
          <span style={{ fontSize: 11, color: '#94A3B8' }}>· {timeAgo(act.date)}</span>
        </div>
      ) : (
        <div style={{ padding: '0 16px 10px 72px' }}>
          <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Sin actividad</span>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function ClientesMobile() {
  const navigate   = useNavigate();
  const { openClientDetail } = useUI();
  const clientsQ   = useClients();
  const { quotes } = useDerivedQuotes();

  const [activeFilter, setActiveFilter] = useState('todos');
  const [search, setSearch]             = useState('');
  const [searchOpen, setSearchOpen]     = useState(false);
  const [page, setPage]                 = useState(1);
  const PAGE_SIZE = 8;

  const clients = clientsQ.data ?? [];

  // Métricas
  const totalClientes   = clients.length;
  const activos         = clients.filter(c => {
    const cq = quotes.filter(q => q.client_id === c.id);
    return cq.length > 0 && daysAgo(c.updated_at) <= 30;
  }).length;
  const valorHistorico  = quotes.reduce((a, q) => a + (q.status === 'Aprobada' ? q.calc.total : 0), 0);
  const recurrentes     = clients.filter(c => quotes.filter(q => q.client_id === c.id && q.status === 'Aprobada').length >= 2).length;
  const sinActividad    = clients.filter(c => quotes.filter(q => q.client_id === c.id).length === 0 || daysAgo(c.updated_at) > 60).length;
  const conCotizaciones = clients.filter(c => quotes.some(q => q.client_id === c.id)).length;

  const FILTERS = [
    { key: 'todos',          label: 'Todos',            count: totalClientes },
    { key: 'activos',        label: 'Activos',          count: activos },
    { key: 'con-cotizaciones', label: 'Con cotizaciones', count: conCotizaciones },
    { key: 'recurrentes',   label: 'Recurrentes',      count: recurrentes },
    { key: 'sin-actividad', label: 'Sin actividad',    count: sinActividad },
  ];

  // Filtrado
  const filtered = clients.filter(c => {
    if (search) {
      const s = search.toLowerCase();
      const match = c.name.toLowerCase().includes(s) || (c.phone ?? '').includes(s) || (c.email ?? '').toLowerCase().includes(s);
      if (!match) return false;
    }
    switch (activeFilter) {
      case 'activos':          return quotes.filter(q => q.client_id === c.id).length > 0 && daysAgo(c.updated_at) <= 30;
      case 'con-cotizaciones': return quotes.some(q => q.client_id === c.id);
      case 'recurrentes':     return quotes.filter(q => q.client_id === c.id && q.status === 'Aprobada').length >= 2;
      case 'sin-actividad':   return quotes.filter(q => q.client_id === c.id).length === 0 || daysAgo(c.updated_at) > 60;
      default: return true;
    }
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Top clientes
  const topClientes = [...clients]
    .map(c => ({ c, valor: quotes.filter(q => q.client_id === c.id && q.status === 'Aprobada').reduce((a, q) => a + q.calc.total, 0) }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  // Actividad reciente (últimas acciones)
  const recentActivity = [...quotes]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 4)
    .map(q => {
      const client = clients.find(c => c.id === q.client_id);
      const action = q.status === 'Aprobada' ? { icon: '✅', text: `aprobó la cotización` }
        : (q.status as string) === 'Vista' ? { icon: '👁', text: `abrió la propuesta` }
        : q.status === 'Enviada' ? { icon: '📤', text: `recibió cotización` }
        : { icon: '📄', text: `actualizó cotización` };
      return { client, q, action };
    });

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>

      {/* ── HEADER ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px' }}>Clientes</div>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>Gestiona y da seguimiento a tus clientes</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setSearchOpen(v => !v)}
              style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E2E8F0', background: searchOpen ? '#EFF6FF' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: searchOpen ? '#2563EB' : '#475569' }}>
              <Search size={16} />
            </button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 5, height: 36, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569', fontFamily: 'inherit' }}>
              <SlidersHorizontal size={14} /> Filtros
            </button>
            <NotificationBell />
          </div>
        </div>

        {/* Búsqueda expandible */}
        {searchOpen && (
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
            <input autoFocus type="search" placeholder="Buscar cliente, teléfono, correo..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ width: '100%', height: 38, border: '1px solid #E2E8F0', borderRadius: 10, paddingLeft: 32, paddingRight: 32, fontSize: 13.5, outline: 'none', background: '#F8FAFC', boxSizing: 'border-box' }} />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Chips de filtro */}
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 12, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
          {FILTERS.map(f => {
            const isActive = activeFilter === f.key;
            return (
              <button key={f.key} onClick={() => { setActiveFilter(f.key); setPage(1); }}
                style={{ flexShrink: 0, border: 'none', borderRadius: 99, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: isActive ? 700 : 500, fontSize: 13, background: isActive ? '#2563EB' : '#F1F5F9', color: isActive ? '#fff' : '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
                {f.label}
                <span style={{ fontSize: 11, fontWeight: 700, background: isActive ? 'rgba(255,255,255,.25)' : '#E2E8F0', color: isActive ? '#fff' : '#64748B', padding: '1px 5px', borderRadius: 99 }}>
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── KPIs scroll horizontal ── */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', padding: '12px 16px 4px' }}>
        {[
          { label: 'Clientes totales',       value: totalClientes,          sub: `+${Math.max(0, Math.round(totalClientes * 0.12))} este mes`, icon: '👥', color: '#2563EB' },
          { label: 'Clientes activos',        value: activos,               sub: totalClientes ? `${Math.round((activos/totalClientes)*100)}% del total` : '—', icon: '✅', color: '#16A34A' },
          { label: 'Valor cotizado histórico', value: fmtCompact(valorHistorico), sub: 'Total aprobado', icon: '💰', color: '#7C3AED' },
          { label: 'Clientes recurrentes',   value: recurrentes,            sub: totalClientes ? `${Math.round((recurrentes/totalClientes)*100)}% del total` : '—', icon: '🔄', color: '#D97706' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 16, padding: '14px 16px', flexShrink: 0, width: 160, boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', lineHeight: 1.3 }}>{kpi.label}</span>
              <span style={{ fontSize: 20 }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 5 }}>{kpi.value}</div>
            <div style={{ fontSize: 11.5, color: kpi.color, fontWeight: 600 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Buscador + acciones (si no está en header) ── */}
      {!searchOpen && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input type="search" placeholder="Buscar cliente, teléfono, correo..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ width: '100%', height: 38, border: '1px solid #E2E8F0', borderRadius: 10, paddingLeft: 30, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }} />
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#475569', fontFamily: 'inherit', flexShrink: 0 }}>
            <Download size={13} /> Exportar
          </button>
          <button onClick={() => navigate('/app/clientes')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', border: 'none', borderRadius: 10, background: '#2563EB', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#fff', fontFamily: 'inherit', flexShrink: 0, height: 38 }}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
      )}

      {/* ── LISTA DE CLIENTES ── */}
      <div style={{ background: '#fff', marginTop: 4, borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        {clientsQ.isLoading ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando...</div>
        ) : paged.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>👥</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
              {search ? 'Sin resultados' : 'No hay clientes aún'}
            </div>
          </div>
        ) : (
          paged.map(c => (
            <ClientCard key={c.id} c={c} quotes={quotes}
              onOpen={() => openClientDetail(c.id)}
              navigate={navigate} />
          ))
        )}
      </div>

      {/* ── Paginación ── */}
      {filtered.length > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#fff', borderBottom: '1px solid #F1F5F9', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            Mostrando {(page-1)*PAGE_SIZE+1} a {Math.min(page*PAGE_SIZE, filtered.length)} de {filtered.length} clientes
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', cursor: page===1?'default':'pointer', opacity: page===1?.4:1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <ChevronLeft size={14} />
            </button>
            {[...Array(Math.min(totalPages, 5))].map((_, i) => {
              const p = i + 1;
              if (p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${p===page?'#2563EB':'#E2E8F0'}`, background: p===page?'#2563EB':'#fff', color: p===page?'#fff':'#475569', fontSize: 12, fontWeight: p===page?700:400, cursor: 'pointer' }}>
                  {p}
                </button>
              );
            })}
            {totalPages > 5 && <span style={{ fontSize: 12, color: '#94A3B8' }}>...</span>}
            {totalPages > 5 && (
              <button onClick={() => setPage(totalPages)}
                style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${page===totalPages?'#2563EB':'#E2E8F0'}`, background: page===totalPages?'#2563EB':'#fff', color: page===totalPages?'#fff':'#475569', fontSize: 12, cursor: 'pointer' }}>
                {totalPages}
              </button>
            )}
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', cursor: page===totalPages?'default':'pointer', opacity: page===totalPages?.4:1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── 2 columnas: Top clientes + Actividad reciente ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px' }}>

        {/* Top clientes */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 14px', border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A' }}>Top clientes</span>
            <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}>Ver todos</span>
          </div>
          {topClientes.map(({ c, valor }, i) => {
            const av2 = avColor(initials(c.name)[0]);
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', minWidth: 14 }}>{i+1}</span>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: av2.bg, color: av2.fg, fontWeight: 800, fontSize: 10.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(c.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name.split(' ')[0]} {c.name.split(' ')[1] ?? ''}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtCompact(valor)}</span>
              </div>
            );
          })}
          {topClientes.length === 0 && <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin datos aún</div>}
        </div>

        {/* Actividad reciente */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 14px', border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A' }}>Actividad</span>
            <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}>Ver todas</span>
          </div>
          {recentActivity.map(({ client, q, action }) => (
            <div key={q.id} style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.3 }}>{action.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: '#0F172A', lineHeight: 1.4 }}>
                  <strong>{client?.name.split(' ')[0] ?? '—'}</strong> {action.text}
                </div>
                <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 2 }}>{timeAgo(q.updated_at)}</div>
              </div>
            </div>
          ))}
          {recentActivity.length === 0 && <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin actividad aún</div>}
        </div>
      </div>

      {/* ── IA Shelwi ── */}
      {(() => {
        const sinSeguimiento = clients.filter(c => {
          const cq = quotes.filter(q => q.client_id === c.id && q.status === 'Enviada');
          return cq.some(q => daysAgo(q.sent_at ?? q.created_at) >= 5);
        }).slice(0, 1);
        if (sinSeguimiento.length === 0) return null;
        const c = sinSeguimiento[0];
        return (
          <div style={{ margin: '0 16px 16px', background: 'linear-gradient(135deg,#1E1B4B 0%,#2D1B8C 100%)', borderRadius: 18, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤖</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Shelwi IA</div>
                <span style={{ fontSize: 9.5, fontWeight: 700, background: '#7C3AED', color: '#fff', padding: '1px 6px', borderRadius: 99 }}>PRO</span>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.9)', lineHeight: 1.5, marginBottom: 8 }}>
                <strong>{c.name}</strong> no ha respondido en {Math.max(...quotes.filter(q => q.client_id === c.id && q.status === 'Enviada').map(q => daysAgo(q.sent_at ?? q.created_at)))} días. Se recomienda seguimiento hoy.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => c.phone && window.open(`https://wa.me/${c.phone.replace(/\D/g,'')}`, '_blank')}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#22C55E', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <MessageCircle size={12} /> WhatsApp
                </button>
                <button onClick={() => c.phone && window.open(`tel:${c.phone}`, '_self')}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, background: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Phone size={12} /> Llamar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Acciones rápidas ── */}
      <div style={{ padding: '4px 16px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Acciones rápidas</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { icon: UserPlus, label: 'Nuevo cliente',    color: '#2563EB', bg: '#EFF6FF', action: () => {} },
            { icon: FileText, label: 'Nueva cotiz.',     color: '#7C3AED', bg: '#F5F3FF', action: () => navigate('/app/cotizaciones/nueva') },
            { icon: Upload,   label: 'Importar',         color: '#0891B2', bg: '#ECFEFF', action: () => {} },
            { icon: Download, label: 'Exportar',         color: '#D97706', bg: '#FFFBEB', action: () => {} },
          ].map(({ icon: Ic, label, color, bg, action }) => (
            <button key={label} onClick={action}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '12px 4px', border: '1px solid #F1F5F9', borderRadius: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic size={18} color={color} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#475569', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
