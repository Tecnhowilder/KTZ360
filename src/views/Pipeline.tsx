/**
 * Pipeline.tsx — CRM Pipeline Kanban (Sprint 5 + R3 fix Sprint 6)
 * Mobile: PipelineMobile (completo)
 * Desktop: PipelineDesktop (Kanban horizontal real, misma fuente de datos)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, AlertTriangle, TrendingUp, ChevronRight,
} from 'lucide-react';
import { useWindowWidth, navModeFor } from '../hooks/useWindowWidth';
import { PipelineMobile } from '../components/crm/PipelineMobile';
import { usePipeline, useUpdateCommercialStatus } from '../hooks/useCRM';
import { useToast } from '../components/ui/Toast';
import { formatCurrencyCOP } from '../lib/currency';
import type { CommercialStatus } from '../lib/database.types';
import type { PipelineQuote } from '../services/crm';

// ─── Definición de columnas (compartida con Mobile) ──────────────────────────

interface ColDef {
  key: CommercialStatus;
  label: string;
  color: string;
  bg: string;
  border: string;
  dotColor: string;
}

const COLUMNS: ColDef[] = [
  { key: 'borrador',    label: 'Borrador',    color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', dotColor: '#94A3B8' },
  { key: 'enviada',     label: 'Enviada',     color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', dotColor: '#3B82F6' },
  { key: 'vista',       label: 'Vista',       color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', dotColor: '#06B6D4' },
  { key: 'negociacion', label: 'Negociación', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dotColor: '#F59E0B' },
  { key: 'aprobada',    label: 'Aprobada',    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', dotColor: '#22C55E' },
  { key: 'rechazada',   label: 'Rechazada',   color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dotColor: '#EF4444' },
];

// ─── Tarjeta de cotización (desktop) ─────────────────────────────────────────

function QuoteCard({
  q, col, onMove, onClick,
}: {
  q: PipelineQuote; col: ColDef;
  onMove: (to: CommercialStatus) => void;
  onClick: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const daysSent = q.sent_at
    ? Math.floor((Date.now() - new Date(q.sent_at).getTime()) / 86_400_000)
    : null;
  const needsFollowup = q.commercial_status === 'enviada' && daysSent !== null && daysSent >= 2;

  const nextStatuses: CommercialStatus[] =
    q.commercial_status === 'borrador'    ? ['enviada'] :
    q.commercial_status === 'enviada'     ? ['vista','negociacion','aprobada','rechazada'] :
    q.commercial_status === 'vista'       ? ['negociacion','aprobada','rechazada'] :
    q.commercial_status === 'negociacion' ? ['aprobada','rechazada'] : [];

  return (
    <div
      style={{
        background: '#fff', borderRadius: 12, border: `1px solid ${col.border}`,
        padding: '12px 13px', marginBottom: 8, cursor: 'pointer',
        position: 'relative', transition: 'box-shadow .15s',
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}
      onClick={onClick}
    >
      {needsFollowup && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: '#D97706', marginBottom: 6 }}>
          <AlertTriangle size={11} /> Pendiente seguimiento
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', marginBottom: 3, lineHeight: 1.3 }}>
        {q.title}
      </div>
      <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 8 }}>{q.client_name ?? '—'}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#2563EB' }}>
          {formatCurrencyCOP(q.total)}
        </span>
        {nextStatuses.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenu(v => !v); }}
              style={{ border: 'none', cursor: 'pointer', background: col.bg, color: col.color, borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Mover <ChevronRight size={11} />
            </button>
            {menu && (
              <>
                <div onClick={e => { e.stopPropagation(); setMenu(false); }} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.14)', zIndex: 10, overflow: 'hidden', minWidth: 140 }}>
                  {nextStatuses.map(s => {
                    const c = COLUMNS.find(x => x.key === s)!;
                    return (
                      <button key={s} onClick={e => { e.stopPropagation(); onMove(s); setMenu(false); }} style={{
                        width: '100%', border: 'none', background: 'none', cursor: 'pointer',
                        padding: '9px 14px', textAlign: 'left', fontSize: 12.5, fontWeight: 600,
                        color: c.color, display: 'block', borderBottom: '1px solid #F8FAFC',
                      }}>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {daysSent !== null && (
        <div style={{ fontSize: 10.5, color: '#CBD5E1', marginTop: 6 }}>
          {daysSent === 0 ? 'Enviada hoy' : `Enviada hace ${daysSent}d`}
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Desktop ─────────────────────────────────────────────────────────

function PipelineDesktop() {
  const navigate     = useNavigate();
  const { showToast } = useToast();
  const pipelineQ    = usePipeline();
  const moveMut      = useUpdateCommercialStatus();

  if (pipelineQ.isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#94A3B8' }}>Cargando pipeline...</div>;
  }

  const pipeline = pipelineQ.data?.pipeline ?? {};
  const quotes   = pipelineQ.data?.quotes   ?? [];

  const totalActivos = quotes.filter(q => !['aprobada','rechazada'].includes(q.commercial_status)).length;
  const totalAprobadas = (pipeline['aprobada']?.count ?? 0);
  const totalValorPipe = quotes
    .filter(q => !['rechazada'].includes(q.commercial_status))
    .reduce((a, q) => a + q.total, 0);
  const convRate = quotes.length > 0
    ? Math.round((totalAprobadas / quotes.length) * 100) : 0;

  async function handleMove(q: PipelineQuote, to: CommercialStatus) {
    try {
      await moveMut.mutateAsync({ quoteId: q.id, newStatus: to });
      showToast(`${q.title} → ${COLUMNS.find(c => c.key === to)?.label ?? to}`);
    } catch (e: any) { showToast(e.message); }
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', margin: 0 }}>Pipeline CRM</h1>
        <p style={{ fontSize: 13.5, color: '#64748B', margin: '4px 0 0' }}>Gestiona el estado comercial de tus cotizaciones</p>
      </div>

      {/* KPI Bar */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Activos en pipeline', value: totalActivos,                  icon: <TrendingUp size={16} />, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Aprobadas',           value: totalAprobadas,                icon: <CheckCircle size={16} />, color: '#16A34A', bg: '#F0FDF4' },
          { label: 'Valor pipeline',      value: formatCurrencyCOP(totalValorPipe), icon: null, color: '#0F172A', bg: '#fff' },
          { label: 'Tasa conversión',     value: `${convRate}%`,               icon: null, color: convRate >= 50 ? '#16A34A' : '#D97706', bg: '#fff' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: '14px 18px', border: '1px solid #E2E8F0', minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              {k.icon && <span style={{ color: k.color }}>{k.icon}</span>}
              <span style={{ fontSize: 11.5, color: '#64748B', fontWeight: 600 }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Kanban Board */}
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 16 }}>
        {COLUMNS.map(col => {
          const colQuotes = quotes.filter(q => q.commercial_status === col.key);
          const colTotal  = colQuotes.reduce((a, q) => a + q.total, 0);
          return (
            <div key={col.key} style={{ minWidth: 260, maxWidth: 300, flex: '0 0 260px' }}>
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: col.bg, borderRadius: '12px 12px 0 0',
                border: `1px solid ${col.border}`, borderBottom: 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.dotColor, display: 'inline-block' }} />
                  <span style={{ fontWeight: 800, fontSize: 13, color: col.color }}>{col.label}</span>
                  <span style={{
                    background: '#fff', color: col.color, fontSize: 11.5, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 99, border: `1px solid ${col.border}`,
                  }}>
                    {colQuotes.length}
                  </span>
                </div>
                {colTotal > 0 && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: col.color }}>
                    {formatCurrencyCOP(colTotal)}
                  </span>
                )}
              </div>

              {/* Column body */}
              <div style={{
                background: col.bg, border: `1px solid ${col.border}`, borderTop: 'none',
                borderRadius: '0 0 12px 12px', padding: '10px 10px', minHeight: 120,
                maxHeight: 'calc(100vh - 320px)', overflowY: 'auto',
              }}>
                {colQuotes.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 10px', color: '#CBD5E1', fontSize: 12.5 }}>
                    Sin cotizaciones
                  </div>
                )}
                {colQuotes.map(q => (
                  <QuoteCard
                    key={q.id}
                    q={q}
                    col={col}
                    onMove={to => handleMove(q, to)}
                    onClick={() => navigate(`/app/cotizaciones/${q.id}`)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function Pipeline() {
  const width   = useWindowWidth();
  const navMode = navModeFor(width);
  if (navMode === 'bottom') return <PipelineMobile />;
  return <PipelineDesktop />;
}
