/**
 * CotizacionesMobile — UX 2026
 * Fiel al mockup: 3 tabs Crear / Mis cotizaciones / Plantillas
 * Mantiene TODA la lógica existente (filtros, paginación, estados, etc.)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, ChevronLeft, X, Plus } from 'lucide-react';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useDerivedQuotes } from '../../hooks/useQuotes';
import { daysAgo } from '../../lib/calc';
import { formatCurrencyCOP } from '../../lib/currency';
import type { DerivedQuote } from '../../lib/types';

// ─── Estado de colores (igual al original) ────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  'Borrador':    { label: 'Borrador',    color: '#64748B', bg: '#F1F5F9' },
  'Enviada':     { label: 'Enviada',     color: '#2563EB', bg: '#EFF6FF' },
  'Vista':       { label: 'Abierta',     color: '#0891B2', bg: '#ECFEFF' },
  'Aprobada':    { label: 'Aprobada',    color: '#16A34A', bg: '#F0FDF4' },
  'Rechazada':   { label: 'Rechazada',   color: '#DC2626', bg: '#FEF2F2' },
  'Vencida':     { label: 'Vencida',     color: '#D97706', bg: '#FFF7ED' },
  'Seguimiento': { label: 'Seguimiento', color: '#D97706', bg: '#FFFBEB' },
};

function isSeguimiento(q: DerivedQuote) {
  return q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 2;
}

function getStatusConfig(q: DerivedQuote) {
  if (isSeguimiento(q)) return STATUS_CONFIG['Seguimiento'];
  return STATUS_CONFIG[q.status] ?? STATUS_CONFIG['Borrador'];
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${d.toLocaleString('es-CO', { month: 'short' }).replace('.', '')}`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function CotizacionesMobile() {
  const navigate = useNavigate();
  const { openQuoteFlow } = useUI();
  const { company } = useWorkspace();
  const { quotes, isLoading } = useDerivedQuotes();

  const [tab, setTab] = useState<'crear' | 'mis' | 'plantillas'>('crear');

  // ── Estado filtros/paginación (tab Mis cotizaciones) ─────────────────────
  const [activeFilter, setActiveFilter] = useState('todas');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const PAGE_SIZE = 8;

  const counts = {
    todas:       quotes.length,
    borrador:    quotes.filter(q => q.status === 'Borrador').length,
    enviada:     quotes.filter(q => q.status === 'Enviada' && !isSeguimiento(q)).length,
    seguimiento: quotes.filter(q => isSeguimiento(q)).length,
    aprobada:    quotes.filter(q => q.status === 'Aprobada').length,
    rechazada:   quotes.filter(q => q.status === 'Rechazada').length,
    vencida:     quotes.filter(q => q.status === 'Vencida').length,
    vista:       quotes.filter(q => (q.status as string) === 'Vista').length,
  };

  const FILTERS = [
    { key: 'todas',       label: 'Todas',      count: counts.todas       },
    { key: 'enviada',     label: 'Enviadas',   count: counts.enviada     },
    { key: 'aprobada',    label: 'Aprobadas',  count: counts.aprobada    },
    { key: 'borrador',    label: 'Borradores', count: counts.borrador    },
    { key: 'seguimiento', label: 'Seguimiento',count: counts.seguimiento },
    { key: 'rechazada',   label: 'Rechazadas', count: counts.rechazada   },
    { key: 'vencida',     label: 'Vencidas',   count: counts.vencida     },
  ];

  const filtered = quotes.filter(q => {
    const ms = !search ||
      q.title.toLowerCase().includes(search.toLowerCase()) ||
      q.clientName.toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeFilter === 'todas') return true;
    if (activeFilter === 'seguimiento') return isSeguimiento(q);
    if (activeFilter === 'vista') return (q.status as string) === 'Vista';
    return q.status.toLowerCase() === activeFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Duplicar cotización
  function handleDuplicate(q: DerivedQuote) {
    openQuoteFlow({
      step: 4, cfg: {
        clientId: q.client_id, proj: q.title + ' (copia)', loc: (q as unknown as Record<string,string>).location || '',
        serviceLines: q.cfg.serviceLines, adminPct: q.cfg.adminPct, imprevistosPct: q.cfg.imprevistosPct,
        util: q.cfg.util, taxMode: q.cfg.taxMode, taxRate: q.cfg.taxRate, advancePct: q.cfg.advancePct,
        docDetailLevel: q.cfg.docDetailLevel, includeTechnicalAnnex: q.cfg.includeTechnicalAnnex,
        validDays: q.cfg.validDays, discount: q.cfg.discount, discountOn: q.cfg.discountOn,
        transportCost: q.cfg.transportCost, transportEnabled: q.cfg.transportEnabled,
      },
    });
  }
  void handleDuplicate; // disponible si se quiere invocar desde el menú de lista

  // Últimas 3 para "Recientes"
  const recent = [...quotes]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 3);

  // Acción de creación
  function doCreate(action: string) {
    switch (action) {
      case 'ia':       navigate('/app/ia/crear'); break;
      case 'photo':    navigate('/app/ia/crear?mode=photo'); break;
      case 'quote':    openQuoteFlow({ cfg: defaultQConfig(company) }); break;
      case 'template': navigate('/app/plantillas'); break;
    }
  }

  return (
    <div style={{ background: '#fff', minHeight: '100vh', paddingBottom: 120 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 0', gap: 8 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={22} color="#374151" />
          </button>
          <h1 style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 800, color: '#0F172A', margin: 0 }}>
            Cotizar
          </h1>
          <button onClick={() => doCreate('quote')}
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
            <Plus size={22} color="#7C3AED" />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex' }}>
          {([
            { key: 'crear',      label: 'Crear' },
            { key: 'mis',        label: 'Mis cotizaciones' },
            { key: 'plantillas', label: 'Plantillas' },
          ] as const).map(t => (
            <button key={t.key}
              onClick={() => {
                setTab(t.key);
                if (t.key === 'plantillas') navigate('/app/plantillas');
              }}
              style={{
                flex: t.key === 'mis' ? 2 : 1,
                padding: '12px 4px',
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? '#7C3AED' : '#94A3B8',
                borderBottom: tab === t.key ? '2.5px solid #7C3AED' : '2px solid transparent',
                whiteSpace: 'nowrap',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ════ TAB: CREAR ════════════════════════════════════════════════════ */}
      {tab === 'crear' && (
        <div>
          {/* Título sección */}
          <div style={{ padding: '20px 16px 8px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 2 }}>
              Crear nueva cotización
            </div>
            <div style={{ fontSize: 13, color: '#94A3B8' }}>Elige la forma más rápida</div>
          </div>

          {/* Opciones — grid 2×2 con iconos PNG */}
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([
              { img: '/icons/habalr con ia.png',     bg: '#F5F3FF', title: 'Hablar con IA',    desc: 'La IA crea la cotización por ti',        action: 'ia'       },
              { img: '/icons/nueva cotizacion.png',   bg: '#EFF6FF', title: 'Nueva cotización', desc: 'Crea desde cero de forma manual',         action: 'quote'    },
              { img: '/icons/desde foto.png',         bg: '#F0FFF4', title: 'Desde foto',       desc: 'Toma una foto y la IA la interpreta',     action: 'photo'    },
              { img: '/icons/seguimiento  (2).png',   bg: '#FEFCE8', title: 'Desde plantilla',  desc: 'Usa una plantilla para ahorrar tiempo',   action: 'template' },
            ] as const).map(opt => (
              <button key={opt.action} onClick={() => doCreate(opt.action)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 0, padding: '12px 8px 10px',
                  border: '1.5px solid #F1F5F9', borderRadius: 16,
                  background: '#fff', cursor: 'pointer', textAlign: 'center',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, background: opt.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 8, overflow: 'hidden',
                }}>
                  <img src={opt.img} alt={opt.title} style={{ width: 36, height: 36, objectFit: 'contain' }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                  {opt.title}
                </span>
              </button>
            ))}
          </div>

          {/* Cotizaciones recientes */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 16px 10px' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Cotizaciones recientes</span>
            <button onClick={() => setTab('mis')}
              style={{ border: 'none', background: 'none', fontSize: 13, fontWeight: 700, color: '#7C3AED', cursor: 'pointer' }}>
              Ver todas
            </button>
          </div>

          {isLoading && (
            <div style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              Cargando...
            </div>
          )}

          <div style={{ padding: '0 16px' }}>
            {recent.map((q, i) => {
              const st = getStatusConfig(q);
              return (
                <button key={q.id} onClick={() => navigate(`/app/cotizaciones/${q.id}`)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 0',
                    border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                    borderTop: i > 0 ? '1px solid #F8FAFC' : 'none',
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{q.clientName}</div>
                    <div style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 2 }}>
                      {formatCurrencyCOP(q.calc.total)}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: st.color, background: st.bg,
                    borderRadius: 99, padding: '4px 10px', flexShrink: 0,
                  }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 12, color: '#94A3B8', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
                    {fmtDate(q.updated_at)}
                  </span>
                </button>
              );
            })}
            {!isLoading && recent.length === 0 && (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                Sin cotizaciones todavía.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ TAB: MIS COTIZACIONES ═════════════════════════════════════════ */}
      {tab === 'mis' && (
        <div>
          {/* Búsqueda */}
          <div style={{ padding: '12px 16px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', borderRadius: 12, padding: '10px 14px' }}>
              <Search size={16} color="#94A3B8" />
              <input value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar cotización o cliente..."
                style={{ border: 'none', background: 'none', flex: 1, fontSize: 14, outline: 'none', color: '#0F172A' }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                  <X size={14} color="#94A3B8" />
                </button>
              )}
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {FILTERS.map(f => {
              const active = activeFilter === f.key;
              return (
                <button key={f.key}
                  onClick={() => { setActiveFilter(f.key); setPage(1); }}
                  style={{
                    flexShrink: 0, padding: '6px 12px', borderRadius: 99,
                    border: 'none', cursor: 'pointer',
                    background: active ? '#7C3AED' : '#F1F5F9',
                    color: active ? '#fff' : '#475569',
                    fontWeight: active ? 700 : 500, fontSize: 12.5,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  {f.label}
                  {f.count > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 800,
                      background: active ? 'rgba(255,255,255,.3)' : '#E2E8F0',
                      color: active ? '#fff' : '#64748B',
                      borderRadius: 99, padding: '1px 5px',
                    }}>{f.count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Lista */}
          {isLoading && <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Cargando...</div>}
          {!isLoading && paged.length === 0 && (
            <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94A3B8' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>Sin cotizaciones</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {search ? 'Prueba otro término de búsqueda' : 'Crea tu primera cotización'}
              </div>
            </div>
          )}

          {paged.map(q => {
            const st = getStatusConfig(q);
            const initial = (q.clientName || '?').charAt(0).toUpperCase();
            const avatarColors = ['#7C3AED','#2563EB','#16A34A','#D97706','#DC2626','#0891B2'];
            const aColor = avatarColors[(q.clientName || '?').charCodeAt(0) % avatarColors.length];
            return (
              <button key={q.id} onClick={() => navigate(`/app/cotizaciones/${q.id}`)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  borderBottom: '1px solid #F8FAFC',
                  background: '#fff',
                }}>
                {/* Avatar */}
                <div style={{
                  width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                  background: aColor + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: aColor }}>{initial}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {q.clientName}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {q.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>{formatCurrencyCOP(q.calc.total)}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: st.color, background: st.bg,
                    borderRadius: 99, padding: '3px 9px', display: 'block', marginBottom: 4,
                  }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>{fmtDate(q.updated_at)}</span>
                </div>
              </button>
            );
          })}

          {/* Paginación */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '16px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 12px', background: '#fff', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? .4 : 1 }}>
                <ChevronLeft size={16} color="#374151" />
              </button>
              <span style={{ fontSize: 13, color: '#64748B' }}>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 12px', background: '#fff', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? .4 : 1 }}>
                <ChevronRight size={16} color="#374151" />
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
