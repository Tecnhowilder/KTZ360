/**
 * PlansEditor — Editor completo de Planes + Features + Límites (Sprint 9)
 * solo super_admin puede editar. support_admin ve en modo lectura.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPlans, listPlanFeatures, listPlanLimits,
  updatePlan, updatePlanFeature, updatePlanLimit,
} from '../../services/admin';
import { useToast } from '../ui/Toast';
import { BRAND_COLORS } from '../../lib/brand';
import { fmt } from '../../lib/calc';

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 18 };
const inputStyle: React.CSSProperties = { border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none' };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4, letterSpacing: '.04em', textTransform: 'uppercase' };
const btnStyle: React.CSSProperties = { border: 'none', background: BRAND_COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer' };

const FEATURE_LABELS: Record<string, string> = {
  ai_enabled: 'IA habilitada', photo_quote_enabled: 'Cotización desde foto',
  templates_enabled: 'Plantillas', branding_enabled: 'Branding',
  custom_qr_enabled: 'QR personalizado', advanced_reports_enabled: 'Reportes avanzados',
  multiuser_enabled: 'Multiusuario', quote_editing_enabled: 'Edición cotizaciones',
  pipeline_enabled: 'Pipeline CRM', orders_enabled: 'Pedidos operativos',
  work_orders_enabled: 'Órdenes de trabajo', gps_enabled: 'GPS',
  ai_credits_enabled: 'Créditos IA', founder_eligible: 'Founder elegible',
  storage_enabled: 'Storage',
};

const LIMIT_LABELS: Record<string, string> = {
  max_quotes_month: 'Cotizaciones/mes', max_clients: 'Clientes',
  ai_credits_monthly: 'Créditos IA/mes', included_users: 'Usuarios incluidos',
};

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 38, height: 22, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} disabled={disabled} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: value ? BRAND_COLORS.primary : '#E2E8F0', transition: '.2s', opacity: disabled ? .5 : 1 }} />
      <span style={{ position: 'absolute', top: 3, left: value ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: '.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </label>
  );
}

export function PlansEditor({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const plansQ    = useQuery({ queryKey: ['adminPlans'],        queryFn: listPlans });
  const featuresQ = useQuery({ queryKey: ['adminPlanFeatures'], queryFn: listPlanFeatures });
  const limitsQ   = useQuery({ queryKey: ['adminPlanLimits'],   queryFn: listPlanLimits });

  const featureMut = useMutation({
    mutationFn: ({ code, feat, val }: { code: string; feat: string; val: boolean }) =>
      updatePlanFeature(code, feat, val),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminPlanFeatures'] }); showToast('Feature actualizada'); },
    onError:   (e: any) => showToast(e.message),
  });

  const limitMut = useMutation({
    mutationFn: ({ code, field, val }: { code: string; field: string; val: number }) =>
      updatePlanLimit(code, field, val),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminPlanLimits'] }); showToast('Límite actualizado'); },
    onError:   (e: any) => showToast(e.message),
  });

  if (!plansQ.data || !featuresQ.data || !limitsQ.data) {
    return <div style={{ color: '#94A3B8', fontSize: 13 }}>Cargando planes…</div>;
  }

  const featuresByCode = new Map(featuresQ.data.map(f => [f.plan_code, f]));
  const limitsByCode   = new Map(limitsQ.data.map(l => [l.plan_code, l]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {plansQ.data.map(plan => {
        const features = featuresByCode.get(plan.code);
        const limits   = limitsByCode.get(plan.code);
        return (
          <div key={plan.id} style={cardStyle}>
            {/* Header plan */}
            <PlanPriceEditor plan={plan} canEdit={canEdit} />

            {/* Features */}
            {features && (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...labelStyle, marginBottom: 10 }}>Feature Flags</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
                  {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                    const val = (features as any)[key] as boolean;
                    return (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', borderRadius: 8, padding: '8px 10px' }}>
                        <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 600 }}>{label}</span>
                        <Toggle
                          value={val}
                          disabled={!canEdit}
                          onChange={v => featureMut.mutate({ code: plan.code, feat: key, val: v })}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Limits */}
            {limits && (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...labelStyle, marginBottom: 10 }}>Límites</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
                  {Object.entries(LIMIT_LABELS).map(([key, label]) => {
                    const val = (limits as any)[key] as number | null;
                    return (
                      <LimitEditor
                        key={key} label={label}
                        value={val} disabled={!canEdit}
                        onSave={v => limitMut.mutate({ code: plan.code, field: key, val: v })}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanPriceEditor({ plan, canEdit }: { plan: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [price, setPrice]   = useState(String(plan.price));
  const [desc, setDesc]     = useState(plan.description ?? '');

  const mut = useMutation({
    mutationFn: () => updatePlan(plan.id, { price: Number(price), description: desc }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['adminPlans'] }); showToast('Plan actualizado'); setEditing(false); },
    onError:    (e: any) => showToast(e.message),
  });

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: '#0F172A', marginBottom: 4 }}>{plan.name} ({plan.code.toUpperCase()})</div>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360 }}>
            <div>
              <label style={labelStyle}>Precio mensual (COP)</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} style={{ ...inputStyle, width: 140 }} />
            </div>
            <div>
              <label style={labelStyle}>Descripción</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => mut.mutate()} style={btnStyle} disabled={mut.isPending}>
                {mut.isPending ? 'Guardando…' : 'Guardar'}
              </button>
              <button onClick={() => setEditing(false)} style={{ ...btnStyle, background: '#E2E8F0', color: '#374151' }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: BRAND_COLORS.primary }}>{fmt(plan.price)}/mes</span>
            {plan.description && <span style={{ fontSize: 12.5, color: '#64748B' }}>{plan.description}</span>}
            {canEdit && (
              <button onClick={() => setEditing(true)} style={{ ...btnStyle, background: '#F1F5F9', color: '#374151', fontSize: 11 }}>
                Editar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LimitEditor({ label, value, disabled, onSave }: { label: string; value: number | null; disabled: boolean; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(String(value ?? ''));

  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      {editing ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <input type="number" value={val} onChange={e => setVal(e.target.value)}
            style={{ ...inputStyle, padding: '4px 6px', width: 80, fontSize: 12 }} />
          <button onClick={() => { onSave(Number(val)); setEditing(false); }} style={{ ...btnStyle, padding: '4px 8px', fontSize: 11 }}>✓</button>
          <button onClick={() => setEditing(false)} style={{ ...btnStyle, background: '#E2E8F0', color: '#374151', padding: '4px 8px', fontSize: 11 }}>✕</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>{value ?? '∞'}</span>
          {!disabled && (
            <button onClick={() => setEditing(true)} style={{ border: 'none', background: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 11, padding: 0 }}>
              ✎
            </button>
          )}
        </div>
      )}
    </div>
  );
}
