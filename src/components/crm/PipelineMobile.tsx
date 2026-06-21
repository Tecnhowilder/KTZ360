/**
 * PipelineMobile — Vista CRM Pipeline para mobile (390–430px).
 * Muestra cotizaciones en columnas por commercial_status.
 * Feature gated: solo PRO/PREMIUM. FREE → UpgradeModal.
 */
import { useState } from 'react';
import {
  TrendingUp, Lock, AlertTriangle, Clock, ChevronRight,
  Phone, MessageCircle, Mail, RefreshCw, CheckCircle, XCircle,
  ArrowRight, Eye,
} from 'lucide-react';
import { usePipeline, useUpdateCommercialStatus } from '../../hooks/useCRM';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { useUI } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { formatCurrencyCOPCompact } from '../../lib/currency';
import { SeguimientoSheet } from './SeguimientoSheet';
import type { PipelineQuote } from '../../services/crm';
import type { CommercialStatus } from '../../lib/database.types';

// ─── Configuración de columnas del pipeline ───────────────────────────────────

interface ColumnDef {
  key: CommercialStatus;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  color: string;
  bg: string;
  border: string;
  dotColor: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'borrador',    label: 'Borrador',     icon: Clock,         color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', dotColor: '#94A3B8' },
  { key: 'enviada',     label: 'Enviada',      icon: ArrowRight,    color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', dotColor: '#3B82F6' },
  { key: 'vista',       label: 'Vista',        icon: Eye,           color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', dotColor: '#06B6D4' },
  { key: 'negociacion', label: 'Negociación',  icon: RefreshCw,     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dotColor: '#F59E0B' },
  { key: 'aprobada',    label: 'Aprobada',     icon: CheckCircle,   color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', dotColor: '#22C55E' },
  { key: 'rechazada',   label: 'Rechazada',    icon: XCircle,       color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dotColor: '#EF4444' },
];

const ACTIVE_COLUMNS: CommercialStatus[] = ['borrador','enviada','vista','negociacion','aprobada'];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SEGUIMIENTO_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  llamada: Phone,
  whatsapp: MessageCircle,
  correo: Mail,
};
void SEGUIMIENTO_ICONS;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgoFromStr(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function isExpiringSoon(q: PipelineQuote): boolean {
  if (!q.sent_at || q.commercial_status === 'aprobada' || q.commercial_status === 'rechazada') return false;
  const sentMs = new Date(q.sent_at).getTime();
  const expiresMs = sentMs + q.valid_days * 86_400_000;
  const daysLeft = (expiresMs - Date.now()) / 86_400_000;
  return daysLeft >= 0 && daysLeft <= 3;
}

// ─── Componente: tarjeta de cotización en pipeline ────────────────────────────

function PipelineCard({
  q,
  colDef,
  onSeguimiento,
  onMove,
}: {
  q: PipelineQuote;
  colDef: ColumnDef;
  onSeguimiento: (q: PipelineQuote) => void;
  onMove: (q: PipelineQuote, to: CommercialStatus) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const daysSinceSent = daysAgoFromStr(q.sent_at);
  const expiring = isExpiringSoon(q);
  const needsFollowup = q.commercial_status === 'enviada' && daysSinceSent >= 2;

  const nextStatuses: CommercialStatus[] = q.commercial_status === 'borrador'   ? ['enviada']
    : q.commercial_status === 'enviada'    ? ['vista','negociacion','aprobada','rechazada']
    : q.commercial_status === 'vista'      ? ['negociacion','aprobada','rechazada']
    : q.commercial_status === 'negociacion'? ['aprobada','rechazada']
    : [];

  const _colLabel = (s: CommercialStatus) => COLUMNS.find(c => c.key === s)?.label ?? s; void _colLabel;

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      border: `1px solid ${colDef.border}`,
      padding: '12px 14px',
      marginBottom: 10,
      position: 'relative',
    }}>
      {/* Indicador de riesgo */}
      {(needsFollowup || expiring) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 10.5, fontWeight: 600,
          color: expiring ? '#DC2626' : '#D97706',
          marginBottom: 8,
        }}>
          <AlertTriangle size={11} />
          {expiring ? 'Vence pronto' : `Sin seguimiento · ${daysSinceSent}d`}
        </div>
      )}

      {/* Nombre del cliente */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>
        {q.client_name ?? 'Sin cliente'}
      </div>

      {/* Número + título */}
      <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 8 }}>
        {q.quote_number} · {q.title}
      </div>

      {/* Total */}
      <div style={{ fontSize: 15, fontWeight: 800, color: colDef.color, marginBottom: 10 }}>
        {formatCurrencyCOPCompact(q.total)}
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onSeguimiento(q)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '7px 0', borderRadius: 8, border: 'none',
            background: '#F1F5F9', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: '#475569',
          }}
        >
          <Phone size={13} />
          Seguimiento
        </button>
        {nextStatuses.length > 0 && (
          <button
            onClick={() => setMenuOpen(p => !p)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '7px 0', borderRadius: 8, border: 'none',
              background: colDef.bg, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: colDef.color,
            }}
          >
            Mover
            <ChevronRight size={13} />
          </button>
        )}
      </div>

      {/* Menú mover */}
      {menuOpen && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0,
          background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', zIndex: 20,
          overflow: 'hidden', marginBottom: 6,
        }}>
          <div style={{ padding: '10px 14px 6px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: .5 }}>
            Mover a
          </div>
          {nextStatuses.map(s => {
            const c = COLUMNS.find(x => x.key === s)!;
            return (
              <button
                key={s}
                onClick={() => { onMove(q, s); setMenuOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', border: 'none', background: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dotColor, flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: c.color }}>{c.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setMenuOpen(false)}
            style={{
              width: '100%', padding: '10px 14px', border: 'none',
              background: '#F8FAFC', cursor: 'pointer',
              fontSize: 12, color: '#94A3B8', borderTop: '1px solid #F1F5F9',
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PipelineMobile() {
  const { workspace: _workspace } = useWorkspace(); void _workspace;
  const { openUpgradeModal } = useUI();
  const featureQ = useFeatureAccess('pipeline_enabled');
  const pipelineQ = usePipeline();
  const updateStatus = useUpdateCommercialStatus();

  const [activeCol, setActiveCol] = useState<CommercialStatus>('enviada');
  const [seguimientoQuote, setSeguimientoQuote] = useState<PipelineQuote | null>(null);

  // Mientras carga feature check
  if (featureQ.isLoading) {
    return (
      <div style={{ minHeight: '100dvh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94A3B8', fontSize: 14 }}>Cargando...</div>
      </div>
    );
  }

  // Sin acceso — FREE
  if (!featureQ.data) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#F8FAFC',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
        }}>
          <Lock size={28} color="#6366F1" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: '0 0 8px', textAlign: 'center' }}>
          Pipeline CRM
        </h2>
        <p style={{ fontSize: 14, color: '#64748B', textAlign: 'center', margin: '0 0 24px', lineHeight: 1.6 }}>
          Visualiza y gestiona tus cotizaciones por etapa comercial. Disponible en plan PRO y PREMIUM.
        </p>
        <ul style={{ margin: '0 0 28px', padding: 0, listStyle: 'none', width: '100%', maxWidth: 300 }}>
          {['Pipeline visual por etapas','Seguimientos y llamadas','Timeline por cliente','Tasas de conversión','IA comercial (probabilidad de cierre)'].map(b => (
            <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13.5, color: '#374151' }}>
              <CheckCircle size={16} color="#22C55E" />
              {b}
            </li>
          ))}
        </ul>
        <button
          onClick={() => openUpgradeModal({
            title: 'Pipeline CRM',
            message: 'Visualiza tus cotizaciones por etapa y aumenta tu tasa de cierre.',
            targetPlan: 'pro',
            ctaLabel: 'Activar PRO',
            bullets: ['Pipeline visual Kanban','Seguimientos y recordatorios','Timeline comercial por cliente'],
          })}
          style={{
            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
            color: '#fff', border: 'none', borderRadius: 14,
            padding: '14px 32px', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', width: '100%', maxWidth: 300,
          }}
        >
          Ver planes PRO
        </button>
      </div>
    );
  }

  const quotes = pipelineQ.data?.quotes ?? [];
  const pipeline = pipelineQ.data?.pipeline ?? {};

  const colQuotes = quotes.filter(q => q.commercial_status === activeCol);
  const colDef = COLUMNS.find(c => c.key === activeCol) ?? COLUMNS[1];

  // Totales para header
  const totalActive = ACTIVE_COLUMNS.reduce((acc, s) => acc + (pipeline[s]?.total ?? 0), 0);
  const _totalApproved = pipeline['aprobada']?.total ?? 0; void _totalApproved;
  const convRate = (() => {
    const approved = pipeline['aprobada']?.count ?? 0;
    const rejected = pipeline['rechazada']?.count ?? 0;
    if (approved + rejected === 0) return 0;
    return Math.round((approved / (approved + rejected)) * 100);
  })();

  function handleMove(q: PipelineQuote, to: CommercialStatus) {
    updateStatus.mutate({ quoteId: q.id, newStatus: to });
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '16px 16px 0', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrendingUp size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>Pipeline CRM</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              {formatCurrencyCOPCompact(totalActive)} en curso · {convRate}% conversión
            </div>
          </div>
        </div>

        {/* KPIs row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Enviadas', value: pipeline['enviada']?.count ?? 0, color: '#2563EB' },
            { label: 'Vistas',   value: pipeline['vista']?.count ?? 0,   color: '#0891B2' },
            { label: 'Negoc.',   value: pipeline['negociacion']?.count ?? 0, color: '#D97706' },
            { label: 'Aprob.',   value: pipeline['aprobada']?.count ?? 0, color: '#16A34A' },
          ].map(k => (
            <div key={k.label} style={{
              flex: 1, background: '#F8FAFC', borderRadius: 10,
              padding: '8px 4px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs de columnas */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 1 }}>
          {COLUMNS.filter(c => c.key !== 'rechazada').map(col => {
            const count = pipeline[col.key]?.count ?? 0;
            const isActive = activeCol === col.key;
            return (
              <button
                key={col.key}
                onClick={() => setActiveCol(col.key)}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 12px', borderRadius: '8px 8px 0 0', border: 'none',
                  background: isActive ? col.bg : 'transparent',
                  borderBottom: isActive ? `2px solid ${col.color}` : '2px solid transparent',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: isActive ? col.dotColor : '#CBD5E1',
                }} />
                <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? col.color : '#64748B' }}>
                  {col.label}
                </span>
                {count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: isActive ? col.color : '#E2E8F0',
                    color: isActive ? '#fff' : '#64748B',
                    borderRadius: 99, padding: '1px 6px',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          {/* Rechazadas al final */}
          {(() => {
            const col = COLUMNS.find(c => c.key === 'rechazada')!;
            const count = pipeline['rechazada']?.count ?? 0;
            const isActive = activeCol === 'rechazada';
            return (
              <button
                key="rechazada"
                onClick={() => setActiveCol('rechazada')}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 12px', borderRadius: '8px 8px 0 0', border: 'none',
                  background: isActive ? col.bg : 'transparent',
                  borderBottom: isActive ? `2px solid ${col.color}` : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? col.dotColor : '#CBD5E1' }} />
                <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? col.color : '#64748B' }}>
                  {col.label}
                </span>
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: isActive ? col.color : '#E2E8F0', color: isActive ? '#fff' : '#64748B', borderRadius: 99, padding: '1px 6px' }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Contenido de la columna activa */}
      <div style={{ padding: '16px 16px 0' }}>
        {/* Header de columna */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', background: colDef.dotColor,
            }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: colDef.color }}>
              {colDef.label}
            </span>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>
              ({colQuotes.length})
            </span>
          </div>
          {pipeline[activeCol] && (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>
              {formatCurrencyCOPCompact(pipeline[activeCol]!.total)}
            </span>
          )}
        </div>

        {/* Cards */}
        {pipelineQ.isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 14 }}>
            Cargando...
          </div>
        ) : colQuotes.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 16px',
            background: '#fff', borderRadius: 16, border: '1px dashed #E2E8F0',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              {activeCol === 'aprobada' ? '🎉' : activeCol === 'rechazada' ? '😞' : '📭'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#64748B' }}>
              {activeCol === 'aprobada'
                ? 'Sin cotizaciones aprobadas todavía'
                : activeCol === 'rechazada'
                ? 'Sin cotizaciones rechazadas'
                : `No hay cotizaciones en ${colDef.label}`}
            </div>
          </div>
        ) : (
          colQuotes.map(q => (
            <PipelineCard
              key={q.id}
              q={q}
              colDef={colDef}
              onSeguimiento={q => setSeguimientoQuote(q)}
              onMove={handleMove}
            />
          ))
        )}
      </div>

      {/* Sheet de seguimiento */}
      {seguimientoQuote && (
        <SeguimientoSheet
          quoteId={seguimientoQuote.id}
          clientId={seguimientoQuote.client_id}
          quoteName={seguimientoQuote.client_name ?? seguimientoQuote.quote_number}
          onClose={() => setSeguimientoQuote(null)}
        />
      )}
    </div>
  );
}
