/**
 * CotizacionesMobile — Pantalla Cotizaciones rediseñada mobile-first.
 * Referencia visual: mockup Shelwi / HubSpot Mobile / Pipedrive.
 * Desktop NO se modifica — solo se activa cuando navMode === 'bottom'.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openPhone, openExternalUrl } from '../../lib/capacitorBridge';
import {
  Search, SlidersHorizontal, LayoutList, Columns, Plus,
  UserPlus, FileText, Package, ChevronRight, ChevronLeft,
  MoreVertical, Eye, Pencil, Copy, Share2, Download, Trash2,
  MessageCircle, Phone, Bell, AlertTriangle, Clock,
  CheckCircle, X,
} from 'lucide-react';
import { useUI } from '../../features/app/UIProvider';
import { useDerivedQuotes } from '../../hooks/useQuotes';
import { daysAgo } from '../../lib/calc';
import { formatCurrencyCOP } from '../../lib/currency';
import { NotificationBell } from '../ui/NotificationBell';
import type { DerivedQuote } from '../../lib/types';

// ─── Colores de estado ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  'Borrador':  { label: 'Borrador',    color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  'Enviada':   { label: 'Enviada',     color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  'Vista':     { label: 'Abierta',     color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
  'Aprobada':  { label: 'Aprobada',    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  'Rechazada': { label: 'Rechazada',   color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  'Vencida':   { label: 'Vencida',     color: '#475569', bg: '#F8FAFC', border: '#E2E8F0' },
};

// "Seguimiento" = Enviadas con ≥2 días sin respuesta
function isSeguimiento(q: DerivedQuote) {
  return q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 2;
}

function getStatusConfig(q: DerivedQuote) {
  if (isSeguimiento(q)) return { label: 'Seguimiento', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' };
  return STATUS_CONFIG[q.status] ?? STATUS_CONFIG['Borrador'];
}

// ─── Colores de avatar por letra ─────────────────────────────────────────────

const AVATAR_COLORS = [
  { bg: '#DBEAFE', fg: '#1D4ED8' }, { bg: '#D1FAE5', fg: '#065F46' },
  { bg: '#EDE9FE', fg: '#6D28D9' }, { bg: '#FEF3C7', fg: '#92400E' },
  { bg: '#FCE7F3', fg: '#9D174D' }, { bg: '#CCFBF1', fg: '#115E59' },
  { bg: '#FEE2E2', fg: '#991B1B' }, { bg: '#E0E7FF', fg: '#3730A3' },
];
const avColor = (s: string) => AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length];

const PAGE_SIZES = [6, 10, 20];

// ─── Componente: Tarjeta de cotización premium ───────────────────────────────

function QuoteCardMobile({
  q, onOpen, onDuplicate, onDelete, navigate,
}: {
  q: DerivedQuote;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const av  = avColor(q.initial || 'A');
  const st  = getStatusConfig(q);
  const dSent = q.sent_at ? daysAgo(q.sent_at) : null;
  const dUpd  = daysAgo(q.updated_at);
  const riesgo = isSeguimiento(q) && dSent !== null && dSent >= 5;

  const menuItems = [
    { icon: Eye,       label: 'Ver',       action: onOpen },
    { icon: Pencil,    label: 'Editar',    action: () => navigate(`/app/cotizaciones/${q.id}/editar`) },
    { icon: Copy,      label: 'Duplicar',  action: onDuplicate },
    { icon: Share2,    label: 'Compartir', action: onOpen },
    { icon: Download,  label: 'PDF',       action: onOpen },
    { icon: Trash2,    label: 'Eliminar',  action: onDelete, danger: true },
  ];

  return (
    <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', position: 'relative' }}>
      {/* Indicador de riesgo */}
      {riesgo && (
        <div style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A', padding: '5px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={12} color="#D97706" />
          <span style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>{dSent} días sin respuesta</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px' }}>
        {/* Avatar */}
        <div
          onClick={onOpen}
          style={{
            width: 42, height: 42, borderRadius: 13, background: av.bg, color: av.fg,
            fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer', letterSpacing: '-.3px',
          }}
        >
          {q.initial}
        </div>

        {/* Contenido principal */}
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
            {q.title}
          </div>
          <div style={{ fontSize: 12.5, color: '#64748B', marginBottom: 3 }}>
            {q.clientName}
            {(q as any).location && <span style={{ color: '#94A3B8' }}> · {(q as any).location}</span>}
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>
            {(q as any).quote_number ?? '#—'}
          </div>
        </div>

        {/* Derecha: valor + estado + menú */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {formatCurrencyCOP(q.calc.total)}
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, color: st.color, background: st.bg,
            border: `1px solid ${st.border}`, padding: '2px 8px', borderRadius: 99,
          }}>
            {st.label}
          </span>

          {/* Menú 3 puntos */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
                <div style={{
                  position: 'absolute', right: 0, top: 28, zIndex: 50,
                  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14,
                  boxShadow: '0 12px 32px rgba(15,23,42,.14)', overflow: 'hidden', minWidth: 160,
                }}>
                  {menuItems.map(item => (
                    <button
                      key={item.label}
                      onClick={e => { e.stopPropagation(); item.action(); setMenuOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '11px 14px', border: 'none', background: 'none', cursor: 'pointer',
                        fontSize: 13.5, fontWeight: 500, textAlign: 'left', fontFamily: 'inherit',
                        color: (item as any).danger ? '#EF4444' : '#0F172A',
                        borderTop: (item as any).danger ? '1px solid #FEE2E2' : 'none',
                      }}
                    >
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

      {/* Pie de tarjeta: fecha actividad */}
      <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={11} color="#94A3B8" />
        <span style={{ fontSize: 11.5, color: '#94A3B8' }}>
          {isSeguimiento(q) && dSent !== null
            ? `Enviada hace ${dSent} ${dSent === 1 ? 'día' : 'días'}`
            : (q.status as string) === 'Vista'
              ? `Abierta hace ${dUpd} ${dUpd === 1 ? 'día' : 'días'}`
              : q.dateLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CotizacionesMobile() {
  const navigate    = useNavigate();
  const { openQuoteFlow } = useUI();
  const { quotes, isLoading } = useDerivedQuotes();

  const [activeFilter, setActiveFilter] = useState('todas');
  const [search, setSearch]             = useState('');
  const [searchOpen, setSearchOpen]     = useState(false);
  const [viewMode, setViewMode]         = useState<'list' | 'kanban'>('list');
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(6);

  // Contadores por estado
  const counts = {
    todas:      quotes.length,
    borrador:   quotes.filter(q => q.status === 'Borrador').length,
    enviada:    quotes.filter(q => q.status === 'Enviada' && !isSeguimiento(q)).length,
    seguimiento: quotes.filter(q => isSeguimiento(q)).length,
    aprobada:   quotes.filter(q => q.status === 'Aprobada').length,
    rechazada:  quotes.filter(q => q.status === 'Rechazada').length,
    vencida:    quotes.filter(q => q.status === 'Vencida').length,
    vista:      quotes.filter(q => (q.status as string) === 'Vista').length,
  };

  const FILTERS = [
    { key: 'todas',       label: 'Todas',       count: counts.todas },
    { key: 'borrador',    label: 'Borradores',   count: counts.borrador },
    { key: 'enviada',     label: 'Enviadas',     count: counts.enviada },
    { key: 'vista',       label: 'Abiertas',     count: counts.vista },
    { key: 'seguimiento', label: 'Seguimiento',  count: counts.seguimiento },
    { key: 'aprobada',    label: 'Aprobadas',    count: counts.aprobada },
    { key: 'rechazada',   label: 'Rechazadas',   count: counts.rechazada },
    { key: 'vencida',     label: 'Vencidas',     count: counts.vencida },
  ];

  // KPIs
  const thisM       = quotes.filter(q => {
    const d = new Date(q.created_at); const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  });
  const totalValor   = thisM.reduce((a, q) => a + q.calc.total, 0);
  const urgentes     = quotes.filter(q => isSeguimiento(q) && daysAgo(q.sent_at ?? q.created_at) >= 3).length;

  // Filtrado
  const filtered = quotes.filter(q => {
    const matchSearch = !search ||
      q.title.toLowerCase().includes(search.toLowerCase()) ||
      q.clientName.toLowerCase().includes(search.toLowerCase()) ||
      ((q as any).quote_number ?? '').toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (activeFilter === 'todas')       return true;
    if (activeFilter === 'seguimiento') return isSeguimiento(q);
    if (activeFilter === 'vista')       return (q.status as string) === 'Vista';
    return q.status.toLowerCase() === activeFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged      = filtered.slice((page - 1) * pageSize, page * pageSize);

  // IA recomendaciones
  const aiRecs = [
    ...quotes.filter(q => (q.status as string) === 'Vista').slice(0, 1).map(q => ({
      text: `${q.clientName} abrió la propuesta — alta probabilidad de cierre.`,
      q, action: 'whatsapp',
    })),
    ...quotes.filter(q => isSeguimiento(q) && daysAgo(q.sent_at ?? q.created_at) >= 5).slice(0, 1).map(q => ({
      text: `${daysAgo(q.sent_at ?? q.created_at)} días sin respuesta de ${q.clientName}. Se recomienda seguimiento.`,
      q, action: 'call',
    })),
  ].slice(0, 2);

  function handleDuplicate(q: DerivedQuote) {
    openQuoteFlow({
      step: 4, cfg: {
        clientId: q.client_id, proj: q.title + ' (copia)', loc: (q as any).location || '',
        serviceLines: q.cfg.serviceLines, adminPct: q.cfg.adminPct, imprevistosPct: q.cfg.imprevistosPct,
        util: q.cfg.util, taxMode: q.cfg.taxMode, taxRate: q.cfg.taxRate, advancePct: q.cfg.advancePct,
        docDetailLevel: q.cfg.docDetailLevel, includeTechnicalAnnex: q.cfg.includeTechnicalAnnex,
        validDays: q.cfg.validDays, discount: q.cfg.discount, discountOn: q.cfg.discountOn,
        transportCost: q.cfg.transportCost, transportEnabled: q.cfg.transportEnabled,
      },
    });
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', fontFamily: 'inherit' }}>

      {/* ── HEADER ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px' }}>Cotizaciones</div>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>Gestiona y da seguimiento a tus propuestas</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setSearchOpen(v => !v)}
              style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E2E8F0', background: searchOpen ? '#EFF6FF' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: searchOpen ? '#2563EB' : '#475569' }}>
              <Search size={16} />
            </button>
            <button
              style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <SlidersHorizontal size={16} />
            </button>
            <NotificationBell />
          </div>
        </div>

        {/* Búsqueda expandible */}
        {searchOpen && (
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              autoFocus type="search"
              placeholder="Buscar cliente, proyecto o #cotización..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ width: '100%', height: 38, border: '1px solid #E2E8F0', borderRadius: 10, paddingLeft: 32, paddingRight: 32, fontSize: 13.5, outline: 'none', background: '#F8FAFC', boxSizing: 'border-box' }}
            />
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
                style={{ flexShrink: 0, border: 'none', borderRadius: 99, padding: '6px 13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: isActive ? 700 : 500, fontSize: 13, background: isActive ? '#2563EB' : '#F1F5F9', color: isActive ? '#fff' : '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
                {f.label}
                {f.count > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: isActive ? 'rgba(255,255,255,.25)' : '#E2E8F0', color: isActive ? '#fff' : '#64748B', padding: '1px 6px', borderRadius: 99 }}>
                    {f.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── KPIs 2x2 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px 4px' }}>
        {[
          {
            icon: <span style={{ fontSize: 18 }}>💰</span>,
            label: 'Valor cotizado',
            value: formatCurrencyCOP(totalValor),
            sub: `${thisM.length} este mes`,
            iconBg: '#EFF6FF',
          },
          {
            icon: <FileText size={18} color="#7C3AED" />,
            label: 'Cotizaciones',
            value: String(quotes.length),
            sub: 'Total activas',
            iconBg: '#F5F3FF',
          },
          {
            icon: <CheckCircle size={18} color="#16A34A" />,
            label: 'Aprobadas',
            value: String(counts.aprobada),
            sub: quotes.length ? `${Math.round((counts.aprobada / quotes.length) * 100)}% del total` : '—',
            iconBg: '#F0FDF4',
          },
          {
            icon: <Bell size={18} color="#D97706" />,
            label: 'Seguimientos',
            value: String(urgentes),
            sub: urgentes > 0 ? 'Requieren atención' : 'Al día',
            subColor: urgentes > 0 ? '#D97706' : '#16A34A',
            iconBg: '#FFFBEB',
          },
        ].map((kpi, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 16, padding: '13px 14px', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B' }}>{kpi.label}</span>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: kpi.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{kpi.icon}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 4 }}>{kpi.value}</div>
            <div style={{ fontSize: 11.5, color: (kpi as any).subColor ?? '#64748B', fontWeight: 500 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Toggle Lista/Kanban ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 10, padding: 3, gap: 2 }}>
          {([{ key: 'list', icon: LayoutList, label: 'Lista' }, { key: 'kanban', icon: Columns, label: 'Kanban' }] as const).map(v => (
            <button key={v.key} onClick={() => setViewMode(v.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, background: viewMode === v.key ? '#fff' : 'transparent', color: viewMode === v.key ? '#0F172A' : '#64748B', boxShadow: viewMode === v.key ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
              <v.icon size={14} /> {v.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#94A3B8' }}>
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── LISTADO ── */}
      <div style={{ background: '#fff', marginTop: 4, borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
        {isLoading ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando...</div>
        ) : paged.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
              {search ? 'Sin resultados' : 'No hay cotizaciones'}
            </div>
            <div style={{ fontSize: 13.5, color: '#64748B' }}>
              {search ? 'Prueba con otro término' : 'Crea tu primera cotización'}
            </div>
          </div>
        ) : (
          paged.map(q => (
            <QuoteCardMobile
              key={q.id}
              q={q}
              navigate={navigate}
              onOpen={() => navigate(`/app/cotizaciones/${q.id}`)}
              onDuplicate={() => handleDuplicate(q)}
              onDelete={() => {/* TODO: confirm delete */}}
            />
          ))
        )}
      </div>

      {/* ── Paginación ── */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#fff', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            Mostrando {(page - 1) * pageSize + 1} a {Math.min(page * pageSize, filtered.length)} de {filtered.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? .4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <ChevronLeft size={14} />
            </button>
            {[...Array(Math.min(totalPages, 3))].map((_, i) => {
              const p = page <= 2 ? i + 1 : page - 1 + i;
              if (p > totalPages) return null;
              return (
                <button key={p} onClick={() => setPage(p)}
                  style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${p === page ? '#2563EB' : '#E2E8F0'}`, background: p === page ? '#2563EB' : '#fff', color: p === page ? '#fff' : '#475569', fontSize: 13, fontWeight: p === page ? 700 : 400, cursor: 'pointer' }}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? .4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <ChevronRight size={14} />
            </button>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{ height: 30, border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, color: '#475569', padding: '0 6px', background: '#fff', cursor: 'pointer' }}>
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s} por página</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── IA Shelwi ── */}
      {aiRecs.length > 0 && (
        <div style={{ margin: '12px 16px', background: 'linear-gradient(135deg, #1E1B4B 0%, #2D1B8C 100%)', borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🤖</div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>Shelwi IA</div>
              <span style={{ fontSize: 10, fontWeight: 700, background: '#7C3AED', color: '#fff', padding: '1px 7px', borderRadius: 99 }}>PRO</span>
            </div>
          </div>
          {aiRecs.map((rec, i) => (
            <div key={i} style={{ margin: '0 12px', marginBottom: 10, background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.9)', lineHeight: 1.5, marginBottom: 10 }}>{rec.text}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {rec.action === 'whatsapp' ? (
                  <button
                    onClick={() => rec.q.client_id && openExternalUrl(`https://wa.me/${(rec.q as any).clientPhone?.replace(/\D/g,'') ?? ''}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#22C55E', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <MessageCircle size={13} /> WhatsApp
                  </button>
                ) : (
                  <button
                    onClick={() => rec.q.client_id && openPhone((rec.q as any).clientPhone ?? '')}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: 'none', borderRadius: 8, background: '#2563EB', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Phone size={13} /> Llamar
                  </button>
                )}
                <button
                  onClick={() => navigate(`/app/cotizaciones/${rec.q.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, background: 'none', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Ver detalle
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Acciones rápidas ── */}
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Acciones rápidas</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { icon: Plus,      label: 'Nueva cotiz.',  color: '#2563EB', bg: '#EFF6FF', action: () => navigate('/app/cotizaciones/nueva') },
            { icon: UserPlus,  label: 'Nuevo cliente', color: '#7C3AED', bg: '#F5F3FF', action: () => {} },
            { icon: FileText,  label: 'Plantilla',     color: '#0891B2', bg: '#ECFEFF', action: () => navigate('/app/plantillas') },
            { icon: Package,   label: 'Catálogo',      color: '#D97706', bg: '#FFFBEB', action: () => navigate('/app/catalogo') },
          ].map(({ icon: Ic, label, color, bg, action }) => (
            <button key={label} onClick={action}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '12px 6px', border: '1px solid #F1F5F9', borderRadius: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic size={18} color={color} />
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#475569', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── FAB — Nueva cotización (fijo sobre el bottom nav) ── */}
      <button
        onClick={() => navigate('/app/cotizaciones/nueva')}
        aria-label="Nueva cotización"
        style={{
          position: 'fixed',
          bottom: 'calc(76px + env(safe-area-inset-bottom))',
          right: 16,
          zIndex: 45,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#2563EB',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(37,99,235,.45)',
        }}
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
