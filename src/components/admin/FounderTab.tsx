/**
 * FounderTab — Gestión de Programa Founder (Sprint 9)
 * Solo super_admin puede crear/editar/activar promociones.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listFounderPromotions, upsertFounderPromotion, activateFounderForWorkspace,
  listWorkspaceSubscriptions,
} from '../../services/admin';
import { useToast } from '../ui/Toast';
import { BRAND_COLORS } from '../../lib/brand';
import { fmt } from '../../lib/calc';
import type { FounderPromotionRow } from '../../lib/database.types';

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 18 };
const inputStyle: React.CSSProperties = { border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4 };
const btnPrimary: React.CSSProperties = { border: 'none', background: BRAND_COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 9, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { ...btnPrimary, background: '#E2E8F0', color: '#374151' };

function PromotionForm({
  initial, onSave, onCancel,
}: {
  initial?: Partial<FounderPromotionRow>;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [planCode, setPlanCode]       = useState(initial?.plan_code ?? 'pro');
  const [name, setName]               = useState(initial?.name ?? '');
  const [founderPrice, setFounderPrice] = useState(String(initial?.founder_price ?? ''));
  const [regularPrice, setRegularPrice] = useState(String(initial?.regular_price ?? ''));
  const [months, setMonths]           = useState(String(initial?.duration_months ?? 12));
  const [maxRed, setMaxRed]           = useState(String(initial?.max_redemptions ?? ''));
  const [active, setActive]           = useState(initial?.active ?? true);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 16 }}>
      <div>
        <label style={labelStyle}>Plan</label>
        <select value={planCode} onChange={e => setPlanCode(e.target.value)} style={inputStyle}>
          <option value="pro">PRO</option>
          <option value="premium">PREMIUM</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Nombre</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="PRO Founder" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Precio Founder (COP)</label>
        <input type="number" value={founderPrice} onChange={e => setFounderPrice(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Precio regular (COP)</label>
        <input type="number" value={regularPrice} onChange={e => setRegularPrice(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Duración (meses)</label>
        <input type="number" value={months} onChange={e => setMonths(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Cupos máx. (vacío=ilimitado)</label>
        <input type="number" value={maxRed} onChange={e => setMaxRed(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} id="pf-active" />
        <label htmlFor="pf-active" style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Activa</label>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 20 }}>
        <button onClick={() => onSave({
          id: initial?.id, planCode, name,
          founderPrice: Number(founderPrice), regularPrice: Number(regularPrice),
          durationMonths: Number(months), maxRedemptions: maxRed ? Number(maxRed) : null, active,
        })} style={btnPrimary}>
          {initial?.id ? 'Actualizar' : 'Crear'}
        </button>
        <button onClick={onCancel} style={btnSecondary}>Cancelar</button>
      </div>
    </div>
  );
}

function ActivateModal({ promotions, onActivate, onClose }: {
  promotions: FounderPromotionRow[];
  onActivate: (workspaceId: string, promoId: string) => void;
  onClose: () => void;
}) {
  const { data: entries = [] } = useQuery({ queryKey: ['adminWorkspaceSubscriptions'], queryFn: listWorkspaceSubscriptions });
  const [wsId, setWsId]     = useState('');
  const [promoId, setPromoId] = useState(promotions[0]?.id ?? '');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 440 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Activar Founder para workspace</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Workspace</label>
            <select value={wsId} onChange={e => setWsId(e.target.value)} style={inputStyle}>
              <option value="">— Selecciona —</option>
              {entries.map(e => (
                <option key={e.workspace.id} value={e.workspace.id}>{e.workspace.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Promoción</label>
            <select value={promoId} onChange={e => setPromoId(e.target.value)} style={inputStyle}>
              {promotions.filter(p => p.active).map(p => (
                <option key={p.id} value={p.id}>{p.name} — {fmt(p.founder_price)}/mes × {p.duration_months}m</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button disabled={!wsId || !promoId} onClick={() => onActivate(wsId, promoId)} style={{ ...btnPrimary, opacity: (!wsId || !promoId) ? .5 : 1 }}>
              Activar
            </button>
            <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FounderTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showCreate, setShowCreate]     = useState(false);
  const [editPromo, setEditPromo]       = useState<FounderPromotionRow | null>(null);
  const [showActivate, setShowActivate] = useState(false);

  const promosQ = useQuery({ queryKey: ['adminFounderPromotions'], queryFn: listFounderPromotions });

  const upsertMut = useMutation({
    mutationFn: upsertFounderPromotion,
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['adminFounderPromotions'] }); showToast('Promoción guardada'); setShowCreate(false); setEditPromo(null); },
    onError:    (e: any) => showToast(e.message),
  });

  const activateMut = useMutation({
    mutationFn: ({ wsId, promoId }: { wsId: string; promoId: string }) => activateFounderForWorkspace(wsId, promoId),
    onSuccess:  () => { showToast('Founder activado para el workspace ✓'); setShowActivate(false); },
    onError:    (e: any) => showToast(e.message),
  });

  const promos = promosQ.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#0F172A' }}>Programa Founder</div>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Precios especiales por tiempo limitado</div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowActivate(true)} style={{ ...btnPrimary, background: '#F0FDF4', color: '#166534' }}>
              Activar para workspace
            </button>
            <button onClick={() => setShowCreate(true)} style={btnPrimary}>+ Nueva promoción</button>
          </div>
        )}
      </div>

      {/* Formulario crear */}
      {showCreate && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Nueva promoción Founder</div>
          <PromotionForm
            onSave={data => upsertMut.mutate(data)}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {/* Lista de promociones */}
      {promos.length === 0 && <div style={{ color: '#94A3B8', fontSize: 13 }}>Sin promociones creadas.</div>}
      {promos.map(p => (
        <div key={p.id} style={cardStyle}>
          {editPromo?.id === p.id ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Editar: {p.name}</div>
              <PromotionForm
                initial={p}
                onSave={data => upsertMut.mutate(data)}
                onCancel={() => setEditPromo(null)}
              />
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>{p.name}</div>
                <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                  Plan: {p.plan_code.toUpperCase()} · {fmt(p.founder_price)}/mes durante {p.duration_months} meses → luego {fmt(p.regular_price)}/mes
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>Cupos: {p.current_redemptions}/{p.max_redemptions ?? '∞'}</span>
                  <span style={{ color: p.active ? '#16A34A' : '#94A3B8', fontWeight: 700 }}>
                    {p.active ? '● Activa' : '○ Inactiva'}
                  </span>
                  {p.valid_until && <span>Hasta: {new Date(p.valid_until).toLocaleDateString('es-CO')}</span>}
                </div>
              </div>
              {canEdit && (
                <button onClick={() => setEditPromo(p)} style={{ ...btnPrimary, background: '#F1F5F9', color: '#374151', alignSelf: 'flex-start' }}>
                  Editar
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Modal activar */}
      {showActivate && (
        <ActivateModal
          promotions={promos}
          onActivate={(wsId, promoId) => activateMut.mutate({ wsId, promoId })}
          onClose={() => setShowActivate(false)}
        />
      )}
    </div>
  );
}
