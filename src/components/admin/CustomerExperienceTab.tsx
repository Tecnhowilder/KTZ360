/**
 * CustomerExperienceTab — CMS Customer Experience Sprint CX
 * /app/admin → tab 'cx'
 * Administra: Loyalty · Reviews · Surveys
 * Reutiliza: get_nps_summary, get_reviews, respond_to_review (Sprint 16 RPCs)
 * NO duplica: CustomerSuccessPage (health scores Sprint 15)
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { supabase } from '../../lib/supabaseClient';
import { starLabel, getNpsSummary } from '../../services/reviews';

// ─── Helper RPC ───────────────────────────────────────────────────────────────

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const r = data as { ok?: boolean; error?: string } & T;
  if (r && typeof r === 'object' && 'ok' in r && r.ok === false)
    throw new Error(r.error ?? `Error en ${name}`);
  return r as T;
}

// ─── Sub-tab ─────────────────────────────────────────────────────────────────

type CXTab = 'loyalty' | 'reviews' | 'surveys';

export function CustomerExperienceTab() {
  const [tab, setTab] = useState<CXTab>('loyalty');
  const { workspace } = useWorkspace();
  const wid = workspace.id;

  const tabs: { key: CXTab; label: string; icon: string }[] = [
    { key: 'loyalty', label: 'Loyalty',  icon: '🏆' },
    { key: 'reviews', label: 'Reseñas',  icon: '⭐' },
    { key: 'surveys', label: 'Encuestas',icon: '📋' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            background: tab === t.key ? '#6366F1' : '#F1F5F9',
            color:      tab === t.key ? '#fff'    : '#374151',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'loyalty'  && <LoyaltySection wid={wid} />}
      {tab === 'reviews'  && <ReviewsSection wid={wid} />}
      {tab === 'surveys'  && <SurveysSection wid={wid} />}
    </div>
  );
}

// ─── LOYALTY ─────────────────────────────────────────────────────────────────

function LoyaltySection({ wid }: { wid: string }) {
  const qc  = useQueryClient();
  const dQ  = useQuery({
    queryKey: ['loyaltyDashboard', wid],
    queryFn:  () => rpc<Record<string, unknown>>('get_loyalty_dashboard', { p_workspace_id: wid }),
    staleTime: 60_000,
  });
  const d = dQ.data;

  // Program config form
  const [progForm, setProgForm] = useState<Record<string, unknown> | null>(null);
  const progMut = useMutation({
    mutationFn: (vals: Record<string, unknown>) => rpc('upsert_loyalty_program', { p_workspace_id: wid, ...vals }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loyaltyDashboard', wid] }); setProgForm(null); },
  });

  // New reward form
  const [rewardForm, setRewardForm] = useState<{ name: string; points: string; qty: string } | null>(null);
  const rewardMut = useMutation({
    mutationFn: (v: typeof rewardForm) => rpc('upsert_loyalty_reward', {
      p_workspace_id: wid, p_name: v!.name,
      p_points_required: parseInt(v!.points) || 0,
      p_quantity: v!.qty ? parseInt(v!.qty) : null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loyaltyDashboard', wid] }); setRewardForm(null); },
  });
  const delRewardMut = useMutation({
    mutationFn: (rid: string) => rpc('delete_loyalty_reward', { p_workspace_id: wid, p_reward_id: rid }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyaltyDashboard', wid] }),
  });

  if (dQ.isLoading) return <div style={{ color: '#94A3B8' }}>Cargando...</div>;

  const prog    = d?.program as Record<string, unknown> | null;
  const rewards = (d?.rewards as Array<Record<string, unknown>>) ?? [];
  const summary = d?.summary as Record<string, number> | null;
  const topC    = (d?.top_clients as Array<Record<string, unknown>>) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { label: 'Puntos emitidos',     value: summary.total_points_issued,   color: '#16A34A' },
            { label: 'Puntos canjeados',     value: summary.total_points_redeemed, color: '#D97706' },
            { label: 'Participantes activos',value: summary.active_participants,   color: '#2563EB' },
            { label: 'Transacciones 30d',    value: summary.tx_last_30d,          color: '#7C3AED' },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: k.color }}>{k.value ?? 0}</div>
              <div style={{ fontSize: 11, color: '#64748B' }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Programa */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Configuración del programa</div>
          {!progForm && (
            <button onClick={() => setProgForm({ ...(prog ?? {}), p_active: prog?.active ?? true })}
              style={{ background: '#EEF2FF', color: '#6366F1', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {prog ? 'Editar' : 'Crear programa'}
            </button>
          )}
        </div>

        {prog && !progForm && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              { label: 'Pts/COP', value: prog.points_per_currency as number },
              { label: 'Pts por OT',   value: prog.points_on_ot_complete as number },
              { label: 'Pts por reseña', value: prog.points_on_review as number },
            ].map(f => (
              <div key={f.label} style={{ background: '#F8FAFC', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#7C3AED' }}>{f.value}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>{f.label}</div>
              </div>
            ))}
          </div>
        )}

        {progForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { key: 'p_points_per_currency', label: 'Puntos por COP de pedido', type: 'number', step: '0.1' },
              { key: 'p_points_on_ot',        label: 'Puntos por OT finalizada', type: 'number' },
              { key: 'p_points_on_review',     label: 'Puntos por dejar reseña', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{f.label}</label>
                <input type={f.type} step={(f as Record<string, string>).step}
                  value={(progForm[f.key] as string) ?? ''}
                  onChange={e => setProgForm(p => ({ ...p!, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, marginTop: 4 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => progMut.mutate(progForm!)}
                disabled={progMut.isPending}
                style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#6366F1', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                {progMut.isPending ? 'Guardando...' : 'Guardar configuración'}
              </button>
              <button onClick={() => setProgForm(null)}
                style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#374151', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recompensas */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Catálogo de recompensas ({rewards.length})</div>
          <button onClick={() => setRewardForm({ name: '', points: '', qty: '' })}
            style={{ background: '#F0FDF4', color: '#16A34A', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            + Nueva recompensa
          </button>
        </div>

        {rewardForm && (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12 }}>
            {[
              { key: 'name',   label: 'Nombre de la recompensa', type: 'text' },
              { key: 'points', label: 'Puntos requeridos',       type: 'number' },
              { key: 'qty',    label: 'Cantidad disponible (vacío = ilimitado)', type: 'number' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{f.label}</label>
                <input type={f.type} value={rewardForm[f.key as keyof typeof rewardForm]}
                  onChange={e => setRewardForm(r => ({ ...r!, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, marginTop: 4 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => rewardMut.mutate(rewardForm)} disabled={rewardMut.isPending}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', background: '#16A34A', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                {rewardMut.isPending ? 'Guardando...' : 'Crear'}
              </button>
              <button onClick={() => setRewardForm(null)}
                style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#374151', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {rewards.map(r => (
          <div key={r.id as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #F1F5F9' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{r.name as string}</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{r.points_required as number} puntos · {r.quantity_redeemed as number} canjeados</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: r.active ? '#16A34A' : '#94A3B8' }}>{r.active ? 'Activa' : 'Inactiva'}</span>
              <button onClick={() => delRewardMut.mutate(r.id as string)}
                style={{ border: 'none', background: '#FEF2F2', color: '#DC2626', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {rewards.length === 0 && <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 16 }}>Sin recompensas. Crea la primera.</div>}
      </div>

      {/* Top clientes */}
      {topC.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Top clientes por puntos</div>
          {topC.map((c, i) => (
            <div key={c.client_id as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ fontSize: 13, color: '#374151' }}>{i + 1}. {c.client_name as string}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#7C3AED' }}>{c.total_points as number} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── REVIEWS ─────────────────────────────────────────────────────────────────

function ReviewsSection({ wid }: { wid: string }) {
  const qc = useQueryClient();

  const npsQ = useQuery({
    queryKey: ['nps', wid],
    queryFn:  () => getNpsSummary(wid),
    staleTime: 60_000,
  });

  const revQ = useQuery({
    queryKey: ['reviews', wid],
    queryFn:  async () => {
      const { data, error } = await supabase.rpc('get_reviews' as never, { p_workspace_id: wid, p_limit: 50 } as never);
      if (error) throw error;
      return data as unknown as { stats: Record<string, unknown>; reviews: Array<Record<string, unknown>> };
    },
    staleTime: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; visible: boolean }) => rpc('toggle_review_visibility', {
      p_workspace_id: wid, p_review_id: v.id, p_visible: v.visible,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews', wid] }),
  });

  const respondMut = useMutation({
    mutationFn: async (v: { id: string; response: string }) => {
      const { error } = await supabase.rpc('respond_to_review' as never, { p_review_id: v.id, p_response: v.response } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews', wid] }),
  });

  const [responseInput, setResponseInput] = useState<Record<string, string>>({});
  const n = npsQ.data;
  const reviews = revQ.data?.reviews ?? [];

  const npsColor = (score: number | null) => score === null ? '#94A3B8' : score >= 50 ? '#16A34A' : score >= 0 ? '#D97706' : '#DC2626';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* NPS + Rating */}
      {n && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { label: 'NPS Score',    value: n.nps ?? '—',               color: npsColor(n.nps) },
            { label: 'Promotores',   value: n.promoters,                 color: '#16A34A' },
            { label: 'Detractores',  value: n.detractors,                color: '#DC2626' },
            { label: 'Rating avg',   value: n.avg_rating ? n.avg_rating + '★' : '—', color: '#F59E0B' },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: '#64748B' }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista de reseñas */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Reseñas ({reviews.length})</div>
        {reviews.length === 0 && <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 16 }}>Sin reseñas todavía.</div>}
        {reviews.map((r) => (
          <div key={r.id as string} style={{ padding: '12px 0', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div>
                <span style={{ fontSize: 14, color: '#F59E0B' }}>{starLabel(r.rating as number)}</span>
                <span style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>{r.client_name as string}</span>
                {!!r.order_number && <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 6 }}>#{r.order_number as string}</span>}
              </div>
              <button onClick={() => toggleMut.mutate({ id: r.id as string, visible: !(r.visible as boolean) })}
                style={{ fontSize: 11, border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                  background: r.visible ? '#FEF2F2' : '#F0FDF4', color: r.visible ? '#DC2626' : '#16A34A', fontWeight: 600 }}>
                {r.visible ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {!!r.comment && <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>"{r.comment as string}"</div>}
            {!!r.response ? (
              <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#1D4ED8' }}>
                ↩ {r.response as string}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  placeholder="Responder a esta reseña..."
                  value={responseInput[r.id as string] ?? ''}
                  onChange={e => setResponseInput(p => ({ ...p, [r.id as string]: e.target.value }))}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
                <button
                  onClick={() => { respondMut.mutate({ id: r.id as string, response: responseInput[r.id as string] ?? '' }); setResponseInput(p => ({ ...p, [r.id as string]: '' })); }}
                  disabled={!responseInput[r.id as string]}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  Enviar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SURVEYS ─────────────────────────────────────────────────────────────────

function SurveysSection({ wid }: { wid: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: 'Encuesta de Satisfacción', include_nps: true, trigger: 'order_completed', delay: '24' });

  const cxQ = useQuery({
    queryKey: ['cxSurveys', wid],
    queryFn:  () => rpc<{ surveys: Array<Record<string, unknown>> }>('get_cx_dashboard', { p_workspace_id: wid }).then(r => (r as unknown as { surveys: Array<Record<string, unknown>> }).surveys ?? []),
    staleTime: 60_000,
  });

  const createMut = useMutation({
    mutationFn: () => rpc('upsert_survey', {
      p_workspace_id: wid,
      p_title:        form.title,
      p_include_nps:  form.include_nps,
      p_trigger:      form.trigger,
      p_delay_hours:  parseInt(form.delay) || 24,
      p_active:       false,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cxSurveys', wid] }); setShowForm(false); },
  });

  const toggleActiveMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => rpc('upsert_survey', {
      p_workspace_id: wid, p_survey_id: v.id, p_active: v.active,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cxSurveys', wid] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => rpc('delete_survey', { p_workspace_id: wid, p_survey_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cxSurveys', wid] }),
  });

  const surveys = cxQ.data ?? [];
  const TRIGGER_LABELS: Record<string, string> = {
    order_completed: 'Al finalizar pedido', work_order_completed: 'Al finalizar OT', manual: 'Manual',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Encuestas ({surveys.length})</div>
        <button onClick={() => setShowForm(true)}
          style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          + Nueva encuesta
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Nueva encuesta</div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Título</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, marginTop: 4 }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Disparador</label>
            <select value={form.trigger} onChange={e => setForm(p => ({ ...p, trigger: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, marginTop: 4 }}>
              {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Retraso (horas)</label>
            <input type="number" value={form.delay} onChange={e => setForm(p => ({ ...p, delay: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, marginTop: 4 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.include_nps} onChange={e => setForm(p => ({ ...p, include_nps: e.target.checked }))} />
            Incluir pregunta NPS (0–10)
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => createMut.mutate()} disabled={createMut.isPending}
              style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: '#6366F1', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {createMut.isPending ? 'Creando...' : 'Crear encuesta'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#374151', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {surveys.map(s => (
        <div key={s.id as string} style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{s.title as string}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                {TRIGGER_LABELS[s.trigger as string]} · {s.delay_hours as number}h delay · {s.responses as number} respuestas
                {!!s.include_nps && ' · NPS incluido'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => toggleActiveMut.mutate({ id: s.id as string, active: !(s.active as boolean) })}
                style={{ fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                  background: s.active ? '#FEF2F2' : '#F0FDF4', color: s.active ? '#DC2626' : '#16A34A' }}>
                {s.active ? 'Desactivar' : 'Activar'}
              </button>
              <button onClick={() => deleteMut.mutate(s.id as string)}
                style={{ fontSize: 12, border: 'none', borderRadius: 8, padding: '5px 8px', background: '#F1F5F9', color: '#64748B', cursor: 'pointer' }}>
                🗑
              </button>
            </div>
          </div>
          {s.avg_nps != null && (
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#374151' }}>
              NPS promedio: <strong>{s.avg_nps as number}</strong>
            </div>
          )}
        </div>
      ))}

      {surveys.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 13 }}>
          Sin encuestas. Crea la primera para recopilar NPS y satisfacción automáticamente.
        </div>
      )}
    </div>
  );
}
