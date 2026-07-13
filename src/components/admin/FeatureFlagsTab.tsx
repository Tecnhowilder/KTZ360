/**
 * FeatureFlagsTab — Gestor de Feature Flags dinámicos (Sprint Final)
 *
 * Permite al Super Admin crear, editar y togglear feature flags sin deploy.
 * Targeting: plan, workspace, usuario, rol, rollout %.
 *
 * Capa 2 del sistema de features (Capa 1 = PlansEditor).
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listFeatureFlags, upsertFeatureFlag, toggleFeatureFlag, deleteFeatureFlag,
  type UpsertFeatureFlagInput,
} from '../../services/featureFlags';
import type { FeatureFlagRow, FeatureFlagCategory } from '../../lib/database.types';
import { useToast } from '../ui/Toast';
import { BRAND_COLORS } from '../../lib/brand';

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const cardStyle:  React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20 };
const inputStyle: React.CSSProperties = { border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4, letterSpacing: '.04em', textTransform: 'uppercase' };
const btnPrimary: React.CSSProperties = { border: 'none', background: BRAND_COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '8px 16px', borderRadius: 9, cursor: 'pointer' };
const btnDanger:  React.CSSProperties = { ...btnPrimary, background: '#EF4444' };
const btnGhost:   React.CSSProperties = { ...btnPrimary, background: 'transparent', color: '#64748B', border: '1.5px solid #E2E8F0' };

const CATEGORY_COLORS: Record<FeatureFlagCategory, string> = {
  ui:       '#6366F1', ai:      '#8B5CF6', ops:      '#0EA5E9',
  billing:  '#F59E0B', push:    '#10B981', email:    '#3B82F6',
  security: '#EF4444', general: '#64748B',
};

const PLAN_OPTIONS = ['free', 'pro', 'premium'];
const ROLE_OPTIONS = ['owner', 'admin', 'supervisor', 'operario', 'super_admin', 'support_admin'];

// ─── Toggle visual ────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer', flexShrink: 0 }}>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: value ? BRAND_COLORS.primary : '#E2E8F0', transition: '.2s' }} />
      <span style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: '.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </label>
  );
}

// ─── Badge de categoría ────────────────────────────────────────────────────────

function CategoryBadge({ cat }: { cat: FeatureFlagCategory }) {
  return (
    <span style={{
      background: CATEGORY_COLORS[cat] + '18',
      color: CATEGORY_COLORS[cat],
      border: `1px solid ${CATEGORY_COLORS[cat]}40`,
      borderRadius: 6, fontSize: 10.5, fontWeight: 700,
      padding: '2px 8px', letterSpacing: '.03em', textTransform: 'uppercase',
    }}>{cat}</span>
  );
}

// ─── Form state vacío ─────────────────────────────────────────────────────────

const EMPTY_FORM: UpsertFeatureFlagInput & { planCodesStr: string; rolloutStr: string; tagsStr: string } = {
  key: '', name: '', description: '', enabled: false,
  category: 'general', planCodes: [], workspaceIds: [], userIds: [], roles: [],
  rolloutPct: null, tags: [],
  planCodesStr: '', rolloutStr: '', tagsStr: '',
};

// ─── Modal Crear/Editar ───────────────────────────────────────────────────────

function FlagFormModal({
  initial, onSave, onClose, saving,
}: {
  initial: typeof EMPTY_FORM;
  onSave: (input: UpsertFeatureFlagInput) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleRoleToggle = (role: string) => {
    const roles = form.roles ?? [];
    set('roles', roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role]);
  };
  const handlePlanToggle = (plan: string) => {
    const plans = form.planCodes ?? [];
    set('planCodes', plans.includes(plan) ? plans.filter(p => p !== plan) : [...plans, plan]);
  };

  const handleSubmit = () => {
    if (!form.key.trim() || !form.name.trim()) return;
    const rolloutPct = form.rolloutStr ? parseInt(form.rolloutStr, 10) : null;
    const tags = form.tagsStr ? form.tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    onSave({ ...form, rolloutPct: isNaN(rolloutPct as number) ? null : rolloutPct, tags });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 20, color: '#0F172A' }}>
          {initial.key ? 'Editar Feature Flag' : 'Nuevo Feature Flag'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Key (único, snake_case)</label>
            <input style={{ ...inputStyle, fontFamily: 'monospace' }} value={form.key}
              onChange={e => set('key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              disabled={!!initial.key} placeholder="new_feature_key" />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Nombre</label>
            <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre legible" />
          </div>

          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Descripción</label>
            <input style={inputStyle} value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="¿Qué controla este flag?" />
          </div>

          <div>
            <label style={labelStyle}>Categoría</label>
            <select style={{ ...inputStyle }} value={form.category ?? 'general'} onChange={e => set('category', e.target.value)}>
              {(['ui','ai','ops','billing','push','email','security','general'] as FeatureFlagCategory[]).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Tags (coma separados)</label>
            <input style={inputStyle} value={form.tagsStr} onChange={e => set('tagsStr', e.target.value)} placeholder="beta, enterprise" />
          </div>
        </div>

        {/* Habilitado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
          <Toggle value={form.enabled} onChange={v => set('enabled', v)} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
            {form.enabled ? 'Habilitado globalmente' : 'Deshabilitado (solo overrides funcionan)'}
          </span>
        </div>

        {/* Planes */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Planes (vacío = todos)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PLAN_OPTIONS.map(p => {
              const active = (form.planCodes ?? []).includes(p);
              return (
                <button key={p} onClick={() => handlePlanToggle(p)} style={{
                  border: `1.5px solid ${active ? BRAND_COLORS.primary : '#E2E8F0'}`,
                  background: active ? BRAND_COLORS.primary + '15' : '#fff',
                  color: active ? BRAND_COLORS.primary : '#64748B',
                  borderRadius: 8, fontSize: 12, fontWeight: 700, padding: '5px 12px', cursor: 'pointer',
                }}>{p.toUpperCase()}</button>
              );
            })}
          </div>
        </div>

        {/* Roles */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Roles (vacío = todos)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ROLE_OPTIONS.map(r => {
              const active = (form.roles ?? []).includes(r);
              return (
                <button key={r} onClick={() => handleRoleToggle(r)} style={{
                  border: `1.5px solid ${active ? '#6366F1' : '#E2E8F0'}`,
                  background: active ? '#6366F115' : '#fff',
                  color: active ? '#6366F1' : '#64748B',
                  borderRadius: 8, fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: 'pointer',
                }}>{r}</button>
              );
            })}
          </div>
        </div>

        {/* Rollout */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Rollout % (vacío = 100%)</label>
          <input style={{ ...inputStyle, maxWidth: 100 }} type="number" min={0} max={100}
            value={form.rolloutStr} onChange={e => set('rolloutStr', e.target.value)} placeholder="100" />
          <span style={{ marginLeft: 8, fontSize: 11.5, color: '#64748B' }}>% de workspaces recibirán el flag</span>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button style={btnGhost} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar Flag'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tabla de flags ───────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 800, color: '#94A3B8', letterSpacing: '.5px', borderBottom: '1px solid #EEF2F7', textAlign: 'left', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle', fontSize: 12.5 };

// ─── Componente principal ─────────────────────────────────────────────────────

export function FeatureFlagsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [editFlag, setEditFlag] = useState<typeof EMPTY_FORM | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [search, setSearch] = useState('');

  const flagsQ = useQuery({
    queryKey: ['adminFeatureFlags'],
    queryFn:  listFeatureFlags,
  });

  const toggleMut = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      toggleFeatureFlag(key, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminFeatureFlags'] });
      showToast('Flag actualizado');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const upsertMut = useMutation({
    mutationFn: upsertFeatureFlag,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminFeatureFlags'] });
      setEditFlag(null);
      showToast('Flag guardado ✓');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteFeatureFlag,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminFeatureFlags'] });
      showToast('Flag eliminado');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const flags = flagsQ.data ?? [];

  const filtered = flags.filter(f => {
    const matchCat = filterCat === 'all' || f.category === filterCat;
    const matchSearch = !search || f.key.includes(search.toLowerCase()) || f.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const categories = Array.from(new Set(flags.map(f => f.category))).sort();

  const openCreate = () => setEditFlag({ ...EMPTY_FORM });
  const openEdit = (f: FeatureFlagRow) => setEditFlag({
    key: f.key, name: f.name, description: f.description ?? '',
    enabled: f.enabled, category: f.category,
    planCodes:  f.plan_codes  ?? [],
    workspaceIds: [],
    userIds:    [],
    roles:      f.roles       ?? [],
    rolloutPct: f.rollout_pct ?? null,
    tags:       f.tags        ?? [],
    planCodesStr: '',
    rolloutStr: f.rollout_pct != null ? String(f.rollout_pct) : '',
    tagsStr: (f.tags ?? []).join(', '),
  });

  const handleDelete = (key: string) => {
    if (!confirm(`¿Eliminar el flag "${key}"? Esta acción no se puede deshacer.`)) return;
    deleteMut.mutate(key);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 2 }}>Feature Flags Manager</h2>
          <p style={{ fontSize: 12.5, color: '#64748B' }}>
            Capa 2 del sistema de features. Activa/desactiva funcionalidades sin deploy.
            <br />
            <span style={{ color: '#94A3B8' }}>Capa 1 (por plan) → Planes & Features</span>
          </p>
        </div>
        {canEdit && (
          <button style={btnPrimary} onClick={openCreate}>+ Nuevo Flag</button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Total Flags', value: flags.length, color: '#0F172A' },
          { label: 'Activos',     value: flags.filter(f => f.enabled).length, color: '#10B981' },
          { label: 'Con rollout', value: flags.filter(f => f.rollout_pct != null && f.rollout_pct < 100).length, color: '#F59E0B' },
          { label: 'Overrides',  value: flags.filter(f => (f.workspace_ids?.length ?? 0) > 0 || (f.user_ids?.length ?? 0) > 0).length, color: '#6366F1' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...cardStyle, padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inputStyle, maxWidth: 200 }} placeholder="Buscar flag…" value={search}
          onChange={e => setSearch(e.target.value)} />
        <button onClick={() => setFilterCat('all')} style={{
          ...btnGhost, background: filterCat === 'all' ? '#EEF2F7' : 'transparent',
          color: filterCat === 'all' ? '#0F172A' : '#64748B',
        }}>Todos</button>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)} style={{
            ...btnGhost,
            background: filterCat === cat ? CATEGORY_COLORS[cat as FeatureFlagCategory] + '15' : 'transparent',
            color:      filterCat === cat ? CATEGORY_COLORS[cat as FeatureFlagCategory] : '#64748B',
            border:     filterCat === cat ? `1.5px solid ${CATEGORY_COLORS[cat as FeatureFlagCategory]}50` : '1.5px solid #E2E8F0',
          }}>{cat}</button>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        {flagsQ.isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando flags…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            {flags.length === 0 ? 'No hay feature flags creados.' : 'No hay flags con ese filtro.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>KEY</th>
                <th style={thStyle}>NOMBRE</th>
                <th style={thStyle}>CATEGORÍA</th>
                <th style={thStyle}>TARGETING</th>
                <th style={thStyle}>ROLLOUT</th>
                <th style={thStyle}>ESTADO</th>
                {canEdit && <th style={thStyle}>ACCIONES</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={tdStyle}>
                    <code style={{ fontSize: 12, background: '#F8FAFC', padding: '2px 6px', borderRadius: 4, color: '#334155' }}>{f.key}</code>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 13 }}>{f.name}</div>
                    {f.description && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{f.description}</div>}
                  </td>
                  <td style={tdStyle}>
                    <CategoryBadge cat={f.category as FeatureFlagCategory} />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(f.plan_codes?.length ?? 0) > 0 && (
                        <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 5, fontSize: 10, padding: '2px 6px', fontWeight: 600 }}>
                          {f.plan_codes!.join(', ')}
                        </span>
                      )}
                      {(f.roles?.length ?? 0) > 0 && (
                        <span style={{ background: '#EDE9FE', color: '#5B21B6', borderRadius: 5, fontSize: 10, padding: '2px 6px', fontWeight: 600 }}>
                          {f.roles!.join(', ')}
                        </span>
                      )}
                      {(f.workspace_ids?.length ?? 0) > 0 && (
                        <span style={{ background: '#DCFCE7', color: '#166534', borderRadius: 5, fontSize: 10, padding: '2px 6px', fontWeight: 600 }}>
                          {f.workspace_ids!.length} ws
                        </span>
                      )}
                      {(f.plan_codes?.length ?? 0) === 0 && (f.roles?.length ?? 0) === 0 && (f.workspace_ids?.length ?? 0) === 0 && (
                        <span style={{ color: '#CBD5E1', fontSize: 11 }}>global</span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {f.rollout_pct != null && f.rollout_pct < 100 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 56, height: 6, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${f.rollout_pct}%`, background: '#F59E0B', borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E' }}>{f.rollout_pct}%</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>100%</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {canEdit ? (
                      <Toggle
                        value={f.enabled}
                        onChange={v => toggleMut.mutate({ key: f.key, enabled: v })}
                      />
                    ) : (
                      <span style={{
                        background: f.enabled ? '#DCFCE7' : '#FEE2E2',
                        color: f.enabled ? '#166534' : '#991B1B',
                        borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '3px 8px',
                      }}>{f.enabled ? 'ON' : 'OFF'}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ ...btnGhost, padding: '5px 10px', fontSize: 11 }} onClick={() => openEdit(f)}>Editar</button>
                        <button style={{ ...btnDanger, padding: '5px 10px', fontSize: 11 }} onClick={() => handleDelete(f.key)}>Eliminar</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Documentación inline */}
      <div style={{ ...cardStyle, marginTop: 16, background: '#F8FAFC' }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>¿Cómo funciona?</h3>
        <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
          <p><strong>Capa 1 (Planes):</strong> Los flags de <code>plan_features</code> determinan qué features incluye cada plan (FREE/PRO/PREMIUM). Se editan en <em>Planes &amp; Features</em>.</p>
          <p><strong>Capa 2 (Dinámicos):</strong> Estos flags permiten activar features para contextos específicos, independientemente del plan:</p>
          <ul style={{ paddingLeft: 18, marginTop: 4 }}>
            <li><strong>Workspace override</strong> → activa el flag para workspaces específicos aunque su plan no lo incluya</li>
            <li><strong>Plan filter</strong> → activa el flag solo para ciertos planes</li>
            <li><strong>Role filter</strong> → activa el flag solo para ciertos roles</li>
            <li><strong>Rollout %</strong> → activa el flag para un porcentaje de workspaces (gradual rollout)</li>
          </ul>
          <p style={{ marginTop: 6 }}>Consumir en código: <code>const {`{ isEnabled }`} = useDynamicFlags(); if (isEnabled('mi_flag')) {`{ ... }`}</code></p>
        </div>
      </div>

      {/* Modal */}
      {editFlag && (
        <FlagFormModal
          initial={editFlag}
          onSave={input => upsertMut.mutate(input)}
          onClose={() => setEditFlag(null)}
          saving={upsertMut.isPending}
        />
      )}
    </div>
  );
}
