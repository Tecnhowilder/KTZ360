/**
 * OrdenesDeTrabajo.tsx — Lista de Órdenes de Trabajo (Sprint 6)
 * Mobile First. PREMIUM only.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, AlertTriangle, ChevronRight, Search } from 'lucide-react';
import { useWorkOrders } from '../hooks/useWorkOrders';
import { useFeatureAccess } from '../hooks/usePermissions';
import { useUI } from '../features/app/UIProvider';
import {
  WO_STATUS_LABELS, WO_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS,
} from '../services/workOrders';
import type { WorkOrderWithRelations } from '../lib/database.types';

const STATUS_FILTERS = [
  { key: undefined,    label: 'Todas' },
  { key: 'pendiente',  label: 'Pendiente' },
  { key: 'asignada',   label: 'Asignada' },
  { key: 'en_progreso',label: 'En progreso' },
  { key: 'pausada',    label: 'Pausada' },
  { key: 'finalizada', label: 'Finalizada' },
  { key: 'cancelada',  label: 'Cancelada' },
];

function WOCard({ wo, onClick }: { wo: WorkOrderWithRelations; onClick: () => void }) {
  const sc = WO_STATUS_COLORS[wo.status] ?? { color: '#64748B', bg: '#F1F5F9' };
  const pc = PRIORITY_COLORS[wo.priority] ?? { color: '#64748B', bg: '#F1F5F9' };
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
      background: '#fff', borderRadius: 14, padding: '14px 16px',
      boxShadow: '0 1px 4px rgba(0,0,0,.07)', display: 'flex', gap: 12, alignItems: 'center',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: sc.bg, color: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Wrench size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.title}</div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
          {wo.work_order_number} · {wo.order_number}
          {wo.client_name ? ` · ${wo.client_name}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: sc.bg, color: sc.color }}>
            {WO_STATUS_LABELS[wo.status]}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: pc.bg, color: pc.color }}>
            {wo.priority === 'urgente' && <AlertTriangle size={9} style={{ marginRight: 3 }} />}
            {PRIORITY_LABELS[wo.priority]}
          </span>
          {wo.assigned_name && (
            <span style={{ fontSize: 11, color: '#94A3B8', padding: '2px 7px', borderRadius: 99, background: '#F8FAFC' }}>
              {wo.assigned_name}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} color="#CBD5E1" style={{ flexShrink: 0 }} />
    </button>
  );
}

export function OrdenesDeTrabajo() {
  const navigate         = useNavigate();
  const { openUpgradeModal } = useUI();
  const featureQ         = useFeatureAccess('work_orders_enabled');
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const { data: workOrders = [], isLoading, error } = useWorkOrders({ status: filter });

  if (featureQ.data === false) {
    return (
      <div style={{ padding: 24, textAlign: 'center', maxWidth: 400, margin: '0 auto', paddingTop: 80 }}>
        <Wrench size={48} color="#CBD5E1" style={{ marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Órdenes de Trabajo — PREMIUM</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 24, lineHeight: 1.6 }}>
          Organiza el trabajo en órdenes ejecutables, asigna técnicos y registra la bitácora operativa.
        </p>
        <button
          onClick={() => openUpgradeModal({ title: 'Órdenes de trabajo en PRO', message: 'Asigna, gestiona y finaliza órdenes de trabajo con bitácora completa.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })}
          style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Actualizar a PRO
        </button>
      </div>
    );
  }

  const filtered = workOrders.filter(wo =>
    !search ||
    wo.title.toLowerCase().includes(search.toLowerCase()) ||
    wo.work_order_number.toLowerCase().includes(search.toLowerCase()) ||
    (wo.client_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (wo.assigned_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const activeCount   = workOrders.filter(wo => !['finalizada','cancelada'].includes(wo.status)).length;
  const urgentCount   = workOrders.filter(wo => wo.priority === 'urgente' && wo.status !== 'finalizada').length;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '20px 16px 0', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: 0 }}>Órdenes de Trabajo</h1>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>
              {activeCount} activas
              {urgentCount > 0 && <span style={{ color: '#EF4444', marginLeft: 6 }}>· {urgentCount} urgentes</span>}
            </p>
          </div>
        </div>

        {/* Buscador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
          <Search size={15} color="#94A3B8" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar OT, cliente o técnico..."
            style={{ border: 'none', background: 'none', flex: 1, fontSize: 13.5, color: '#0F172A', outline: 'none' }}
          />
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.label} onClick={() => setFilter(f.key)}
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 99,
                padding: '5px 12px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                background: filter === f.key ? '#2563EB' : '#F1F5F9',
                color:      filter === f.key ? '#fff' : '#64748B',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14 }}>Cargando OTs...</div>}
        {error    && <div style={{ textAlign: 'center', padding: 40, color: '#EF4444', fontSize: 14 }}>Error al cargar OTs</div>}
        {!isLoading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Wrench size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Sin órdenes de trabajo</div>
            <div style={{ fontSize: 13, color: '#94A3B8' }}>
              {filter ? 'Sin OT con este estado.' : 'Crea OTs desde el detalle de un pedido.'}
            </div>
          </div>
        )}
        {filtered.map(wo => (
          <WOCard key={wo.id} wo={wo} onClick={() => navigate(`/app/ordenes-trabajo/${wo.id}`)} />
        ))}
      </div>
    </div>
  );
}
