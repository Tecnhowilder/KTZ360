/**
 * SeguimientoSheet — Bottom sheet para crear y ver seguimientos.
 * Usado desde Pipeline, QuoteDetail y ClientDetail.
 */
import { useState } from 'react';
import {
  X, Phone, MessageCircle, Mail, MapPin, Users, FileText,
  CheckCircle, ChevronDown,
} from 'lucide-react';
import { useCreateSeguimiento, useSeguimientos } from '../../hooks/useCRM';
import { useToast } from '../ui/Toast';
import type { SeguimientoType } from '../../lib/database.types';

const TYPE_CONFIG: Array<{
  key: SeguimientoType;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  bg: string;
}> = [
  { key: 'llamada',   label: 'Llamada',   icon: Phone,          color: '#2563EB', bg: '#EFF6FF' },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: MessageCircle,  color: '#16A34A', bg: '#F0FDF4' },
  { key: 'correo',    label: 'Correo',    icon: Mail,           color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'visita',    label: 'Visita',    icon: MapPin,         color: '#D97706', bg: '#FFFBEB' },
  { key: 'reunion',   label: 'Reunión',   icon: Users,          color: '#0891B2', bg: '#ECFEFF' },
  { key: 'nota',      label: 'Nota',      icon: FileText,       color: '#64748B', bg: '#F8FAFC' },
];

const RESULTADOS = [
  { key: 'contactado',     label: 'Contactado' },
  { key: 'no_contesto',    label: 'No contestó' },
  { key: 'interesado',     label: 'Interesado' },
  { key: 'no_interesado',  label: 'No interesado' },
  { key: 'reprogramar',    label: 'Reprogramar' },
];

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diff < 1)   return 'Justo ahora';
  if (diff < 60)  return `Hace ${diff} min`;
  if (diff < 1440) return `Hace ${Math.floor(diff / 60)} h`;
  if (diff < 10080) return `Hace ${Math.floor(diff / 1440)} d`;
  return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

interface Props {
  quoteId?: string | null;
  clientId?: string | null;
  quoteName: string;
  onClose: () => void;
}

export function SeguimientoSheet({ quoteId, clientId, quoteName, onClose }: Props) {
  const { showToast } = useToast();
  const createMut = useCreateSeguimiento();
  const seguimientosQ = useSeguimientos(quoteId ?? undefined, clientId ?? undefined);

  const [tab, setTab]           = useState<'nuevo' | 'historial'>('nuevo');
  const [tipo, setTipo]         = useState<SeguimientoType>('llamada');
  const [resultado, setRes]     = useState('');
  const [comentario, setCom]    = useState('');
  const [showRes, setShowRes]   = useState(false);

  async function handleSubmit() {
    if (!tipo) return;
    try {
      await createMut.mutateAsync({
        quoteId, clientId, type: tipo,
        resultado: resultado || null,
        comentario: comentario || null,
      });
      showToast('Seguimiento registrado');
      setTab('historial');
      setCom('');
      setRes('');
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Error al guardar');
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.4)' }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 55,
        background: '#fff',
        borderRadius: '20px 20px 0 0',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 40px rgba(15,23,42,0.15)',
        maxHeight: '85dvh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Seguimiento</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>{quoteName}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', padding: '0 20px' }}>
          {(['nuevo', 'historial'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '9px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13.5, fontWeight: tab === t ? 700 : 500,
                color: tab === t ? '#2563EB' : '#64748B',
                borderBottom: tab === t ? '2px solid #2563EB' : '2px solid transparent',
              }}
            >
              {t === 'nuevo' ? 'Nuevo' : `Historial (${seguimientosQ.data?.length ?? 0})`}
            </button>
          ))}
        </div>

        {/* Contenido scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {tab === 'nuevo' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tipo */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 }}>
                  Tipo
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {TYPE_CONFIG.map(tc => {
                    const isActive = tipo === tc.key;
                    return (
                      <button
                        key={tc.key}
                        onClick={() => setTipo(tc.key)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                          padding: '10px 6px', borderRadius: 12,
                          border: isActive ? `2px solid ${tc.color}` : '2px solid #F1F5F9',
                          background: isActive ? tc.bg : '#fff',
                          cursor: 'pointer', transition: 'all .12s',
                        }}
                      >
                        <tc.icon size={18} color={isActive ? tc.color : '#94A3B8'} />
                        <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? tc.color : '#64748B' }}>
                          {tc.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resultado (dropdown) */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 }}>
                  Resultado
                </div>
                <button
                  onClick={() => setShowRes(p => !p)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '11px 14px', borderRadius: 12,
                    border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer',
                    fontSize: 14, color: resultado ? '#0F172A' : '#94A3B8',
                  }}
                >
                  <span>{resultado ? RESULTADOS.find(r => r.key === resultado)?.label : 'Seleccionar resultado'}</span>
                  <ChevronDown size={16} color="#94A3B8" />
                </button>
                {showRes && (
                  <div style={{
                    marginTop: 4, borderRadius: 12, border: '1px solid #E2E8F0',
                    background: '#fff', overflow: 'hidden',
                    boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
                  }}>
                    {RESULTADOS.map(r => (
                      <button
                        key={r.key}
                        onClick={() => { setRes(r.key); setShowRes(false); }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '12px 14px', border: 'none', cursor: 'pointer',
                          background: resultado === r.key ? '#EFF6FF' : 'transparent',
                          fontSize: 14, color: resultado === r.key ? '#2563EB' : '#0F172A',
                          textAlign: 'left',
                        }}
                      >
                        {resultado === r.key && <CheckCircle size={14} color="#2563EB" />}
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Comentario */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 }}>
                  Comentario
                </div>
                <textarea
                  value={comentario}
                  onChange={e => setCom(e.target.value)}
                  placeholder="¿Qué pasó en este seguimiento?"
                  rows={3}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: 12,
                    border: '1px solid #E2E8F0', background: '#fff',
                    fontSize: 14, color: '#0F172A', resize: 'none',
                    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Guardar */}
              <button
                onClick={handleSubmit}
                disabled={createMut.isPending}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
                  background: createMut.isPending ? '#E2E8F0' : '#2563EB',
                  color: createMut.isPending ? '#94A3B8' : '#fff',
                  fontSize: 15, fontWeight: 700, cursor: createMut.isPending ? 'not-allowed' : 'pointer',
                }}
              >
                {createMut.isPending ? 'Guardando...' : 'Guardar seguimiento'}
              </button>
            </div>

          ) : (
            /* Historial */
            <div>
              {seguimientosQ.isLoading ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 14 }}>Cargando...</div>
              ) : !seguimientosQ.data?.length ? (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 14, color: '#64748B' }}>Sin seguimientos registrados</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {seguimientosQ.data.map(s => {
                    const tc = TYPE_CONFIG.find(t => t.key === s.type) ?? TYPE_CONFIG[0];
                    const resLabel = RESULTADOS.find(r => r.key === s.resultado)?.label;
                    return (
                      <div key={s.id} style={{
                        background: '#F8FAFC', borderRadius: 12, padding: '12px 14px',
                        border: '1px solid #F1F5F9',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <tc.icon size={14} color={tc.color} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{tc.label}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{timeAgo(s.created_at)}</div>
                          </div>
                          {resLabel && (
                            <span style={{
                              fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 99,
                              background: tc.bg, color: tc.color,
                            }}>
                              {resLabel}
                            </span>
                          )}
                        </div>
                        {s.comentario && (
                          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginTop: 2 }}>
                            {s.comentario}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
