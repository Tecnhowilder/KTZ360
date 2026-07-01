/**
 * Pedidos.tsx — Lista de pedidos operativos (Sprint 6)
 * Mobile First: 390px → tablet → desktop
 * PREMIUM only: feature gated via backend
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Package, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronRight, Search } from 'lucide-react';
import { useOrders } from '../hooks/useOrders';
import { useFeatureAccess } from '../hooks/usePermissions';
import { useUI } from '../features/app/UIProvider';
import { formatCurrencyCOP } from '../lib/currency';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../services/workOrders';
import type { OrderWithRelations } from '../lib/database.types';

const STATUS_FILTERS = [
  { key: undefined,       label: 'Todos' },
  { key: 'pendiente',     label: 'Pendiente' },
  { key: 'programado',    label: 'Programado' },
  { key: 'en_ejecucion',  label: 'En ejecución' },
  { key: 'pausado',       label: 'Pausado' },
  { key: 'finalizado',    label: 'Finalizado' },
  { key: 'cancelado',     label: 'Cancelado' },
];

function StatusIcon({ status }: { status: string }) {
  const s: Record<string, React.ReactNode> = {
    pendiente:    <Clock size={14} />,
    programado:   <Clock size={14} />,
    en_ejecucion: <Package size={14} />,
    pausado:      <AlertTriangle size={14} />,
    finalizado:   <CheckCircle2 size={14} />,
    cancelado:    <XCircle size={14} />,
  };
  return <>{s[status] ?? <Package size={14} />}</>;
}

function OrderCard({ order, onClick }: { order: OrderWithRelations; onClick: () => void }) {
  const clr = ORDER_STATUS_COLORS[order.status] ?? { color: '#64748B', bg: '#F1F5F9' };
  const progress = order.work_order_count > 0
    ? Math.round((order.work_orders_done / order.work_order_count) * 100)
    : null;

  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
      background: '#fff', borderRadius: 14, padding: '14px 16px',
      boxShadow: '0 1px 4px rgba(0,0,0,.07)', display: 'flex', gap: 12, alignItems: 'center',
    }}>
      {/* Ícono estado */}
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: clr.bg, color: clr.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <StatusIcon status={order.status} />
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.title}
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: clr.bg, color: clr.color, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <StatusIcon status={order.status} />
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
          {order.order_number}
          {order.client_name ? ` · ${order.client_name}` : ''}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2563EB' }}>
            {formatCurrencyCOP(order.total_amount)}
          </span>
          {progress !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 64, height: 5, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? '#22C55E' : '#2563EB', borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 10.5, color: '#94A3B8' }}>{order.work_orders_done}/{order.work_order_count} OT</span>
            </div>
          )}
        </div>
      </div>
      <ChevronRight size={16} color="#CBD5E1" style={{ flexShrink: 0 }} />
    </button>
  );
}

export function Pedidos() {
  const navigate             = useNavigate();
  const { openUpgradeModal } = useUI();
  const featureQ             = useFeatureAccess('orders_enabled');
  const [filter,    setFilter]    = useState<string | undefined>(undefined);
  const [search,    setSearch]    = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FASE 3: debounce 300ms → evita query en cada pulsación
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const { data: orders = [], isLoading, error } = useOrders(filter);

  // Feature gate: PREMIUM only
  if (featureQ.data === false) {
    return (
      <div style={{ padding: 24, textAlign: 'center', maxWidth: 400, margin: '0 auto', paddingTop: 80 }}>
        <Package size={48} color="#CBD5E1" style={{ marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
          Pedidos — Plan PREMIUM
        </h2>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 24, lineHeight: 1.6 }}>
          Convierte cotizaciones aprobadas en pedidos ejecutables y gestiona órdenes de trabajo.
        </p>
        <button
          onClick={() => openUpgradeModal({ title: 'Pedidos operativos en PREMIUM', message: 'Gestiona pedidos, órdenes de trabajo y bitácora operativa.', targetPlan: 'premium', ctaLabel: 'Actualizar a PREMIUM' })}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Actualizar a PREMIUM
        </button>
      </div>
    );
  }

  const filtered = orders.filter(o =>
    !debouncedSearch ||
    o.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    o.order_number.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (o.client_name ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())
  );
  const activeCount   = orders.filter(o => !['finalizado','cancelado'].includes(o.status)).length;
  const finishedCount = orders.filter(o => o.status === 'finalizado').length;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '20px 16px 0', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: 0 }}>Pedidos</h1>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>
              {activeCount} activos · {finishedCount} finalizados
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => navigate('/app/pedidos/nuevo')}
              style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} /> Nuevo pedido
            </button>
            <button
              onClick={() => navigate('/app/cotizaciones')}
              style={{ background: '#F1F5F9', color: '#374151', border: 'none', borderRadius: 12, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Desde cotización
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
          <Search size={15} color="#94A3B8" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, cliente, técnico o estado..."
            style={{ border: 'none', background: 'none', flex: 1, fontSize: 13.5, color: '#0F172A', outline: 'none' }}
          />
          {isLoading && search && (
            <div style={{ width: 14, height: 14, border: '2px solid #7C3AED', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .6s linear infinite', flexShrink: 0 }} />
          )}
        </div>

        {/* Filtros de estado */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => setFilter(f.key)}
              style={{
                border:       'none', cursor: 'pointer', borderRadius: 99,
                padding:      '5px 12px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                background:   filter === f.key ? '#2563EB' : '#F1F5F9',
                color:        filter === f.key ? '#fff' : '#64748B',
                transition:   'all .15s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14 }}>Cargando pedidos...</div>}
        {error    && <div style={{ textAlign: 'center', padding: 40, color: '#EF4444', fontSize: 14 }}>Error al cargar pedidos</div>}
        {!isLoading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Package size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Sin pedidos</div>
            <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16 }}>
              {filter ? 'No hay pedidos con este estado.' : 'Crea un pedido directo o aprueba una cotización.'}
            </div>
            {!filter && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => navigate('/app/pedidos/nuevo')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: 'none', borderRadius: 12, background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  <Plus size={14} /> Nuevo pedido
                </button>
                <button onClick={() => navigate('/app/cotizaciones')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: '1.5px solid #E2E8F0', borderRadius: 12, background: '#fff', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Desde cotización
                </button>
              </div>
            )}
          </div>
        )}
        {filtered.map(o => (
          <OrderCard
            key={o.id}
            order={o}
            onClick={() => navigate(`/app/pedidos/${o.id}`)}
          />
        ))}
      </div>
    </div>
  );
}
