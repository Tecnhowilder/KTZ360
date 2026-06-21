/**
 * IAAdminTab — IA Costos + Uso global cross-workspace (Sprint 9)
 * super_admin puede editar costos. support_admin solo ve.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listAiOperationCosts, updateAiCost, getAiUsageGlobal } from '../../services/admin';
import { useToast } from '../ui/Toast';
import { BRAND_COLORS } from '../../lib/brand';

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 18 };
const inputStyle: React.CSSProperties = { border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '6px 8px', fontSize: 13, outline: 'none' };
const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 800, color: '#94A3B8', letterSpacing: '.5px', borderBottom: '1px solid #EEF2F7', textAlign: 'left' as const };
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' as const, fontSize: 12.5 };

export function IAAdminTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const costsQ = useQuery({ queryKey: ['adminAiCosts'],    queryFn: listAiOperationCosts });
  const usageQ = useQuery({ queryKey: ['adminAiUsageGlobal'], queryFn: getAiUsageGlobal });

  const costMut = useMutation({
    mutationFn: ({ op, credits }: { op: string; credits: number }) => updateAiCost(op, credits),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminAiCosts'] }); showToast('Costo actualizado'); },
    onError:   (e: any) => showToast(e.message),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Costos por operación */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Costos IA por operación</div>
        {!costsQ.data ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Cargando…</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={thStyle}>Operación</th>
                  <th style={thStyle}>Descripción</th>
                  <th style={thStyle}>Créditos</th>
                  <th style={thStyle}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {costsQ.data.map(op => (
                  <CostRow key={op.operation} op={op} canEdit={canEdit}
                    onSave={credits => costMut.mutate({ op: op.operation, credits })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Uso global */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Consumo IA global por workspace</div>
        {!usageQ.data ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Cargando…</div> : (
          usageQ.data.length === 0
            ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Sin uso registrado.</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={thStyle}>Workspace</th>
                      <th style={thStyle}>Llamadas</th>
                      <th style={thStyle}>Créditos usados</th>
                      <th style={thStyle}>Costo estimado</th>
                      <th style={thStyle}>Último uso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageQ.data.map(row => (
                      <tr key={row.workspace_id} style={{ borderTop: '1px solid #F1F5F9' }}>
                        <td style={tdStyle}>{row.workspace_name}</td>
                        <td style={tdStyle}>{row.total_calls}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{row.total_credits}</td>
                        <td style={tdStyle}>${(row.total_cost_usd ?? 0).toFixed(4)}</td>
                        <td style={tdStyle}>{row.last_used ? new Date(row.last_used).toLocaleDateString('es-CO') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </div>
    </div>
  );
}

function CostRow({ op, canEdit, onSave }: { op: any; canEdit: boolean; onSave: (c: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(String(op.credits_cost));

  return (
    <tr style={{ borderTop: '1px solid #F1F5F9' }}>
      <td style={{ ...tdStyle, fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{op.operation}</td>
      <td style={tdStyle}>{op.description ?? '—'}</td>
      <td style={tdStyle}>
        {editing ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="number" min={1} value={val} onChange={e => setVal(e.target.value)}
              style={{ ...inputStyle, width: 60 }} />
            <button onClick={() => { onSave(Number(val)); setEditing(false); }}
              style={{ border: 'none', background: BRAND_COLORS.primary, color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>✓</button>
            <button onClick={() => setEditing(false)}
              style={{ border: 'none', background: '#E2E8F0', color: '#374151', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: BRAND_COLORS.primary }}>{op.credits_cost}</span>
            {canEdit && (
              <button onClick={() => setEditing(true)}
                style={{ border: 'none', background: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 12 }}>✎</button>
            )}
          </div>
        )}
      </td>
      <td style={tdStyle}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
          color: op.active ? '#16A34A' : '#94A3B8', background: op.active ? '#F0FDF4' : '#F1F5F9' }}>
          {op.active ? 'Activa' : 'Inactiva'}
        </span>
      </td>
    </tr>
  );
}
