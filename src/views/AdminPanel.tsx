import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { isSuperAdmin } from '../lib/permissions';
import {
  listWorkspaceSubscriptions,
  listPlans,
  updateSubscription,
  listSystemConfiguration,
  updateSystemConfiguration,
  listAdminSettings,
  updateAdminSetting,
  getAdminDashboardStats,
  listPlanFeatures,
  listPlanLimits,
  listAllProfiles,
  listAuditLog,
  type WorkspaceSubscriptionEntry,
} from '../services/admin';
import type { SubscriptionRow, SystemConfigurationRow, AdminSettingRow } from '../lib/database.types';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/calc';
import { BRAND_COLORS } from '../lib/brand';

const SUBSCRIPTION_STATUSES: SubscriptionRow['status'][] = [
  'trial_active', 'active', 'past_due', 'cancelled', 'expired', 'suspended', 'free',
];

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 18 };
const inputStyle: React.CSSProperties = { border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none' };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4, letterSpacing: '.04em', textTransform: 'uppercase' };
const buttonStyle: React.CSSProperties = { border: 'none', background: BRAND_COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 9, cursor: 'pointer' };
const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 800, color: '#94A3B8', letterSpacing: '.5px', borderBottom: '1px solid #EEF2F7', textAlign: 'left', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle', fontSize: 12.5 };

type Tab = 'dashboard' | 'subscriptions' | 'plans' | 'users' | 'workspaces' | 'audit' | 'system' | 'support';

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  subscriptions: 'Suscripciones',
  plans: 'Planes',
  users: 'Usuarios',
  workspaces: 'Workspaces',
  audit: 'Auditoría',
  system: 'Configuración',
  support: 'Soporte',
};

export function AdminPanel() {
  const adminQuery = useQuery({ queryKey: ['isSuperAdmin'], queryFn: isSuperAdmin });
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) ?? 'dashboard';

  if (adminQuery.isLoading) return null;

  if (!adminQuery.data) {
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Acceso restringido</h1>
        <p style={{ fontSize: 13.5, color: '#64748B' }}>Esta sección es exclusiva para super administradores.</p>
      </div>
    );
  }

  const tabs: Tab[] = ['dashboard', 'subscriptions', 'plans', 'users', 'workspaces', 'audit', 'system', 'support'];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Panel de administración</h1>
      <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>Gestión global de Shelwi.</p>

      <div style={{ display: 'flex', gap: 6, background: '#EEF2F7', padding: 5, borderRadius: 14, marginBottom: 18, flexWrap: 'wrap', maxWidth: 760 }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setSearchParams({ tab: t })}
            style={{
              border: 'none', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#0F172A' : '#64748B',
              fontWeight: 700, fontSize: 12.5, padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
              boxShadow: tab === t ? '0 2px 6px rgba(15,23,42,.1)' : 'none',
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'subscriptions' && <SubscriptionsTab />}
      {tab === 'plans' && <PlansTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'workspaces' && <WorkspacesTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'system' && <ConfigTab />}
      {tab === 'support' && <SupportTab />}
    </div>
  );
}

const PLAN_LABELS: Record<string, string> = { free: 'FREE', pro: 'PRO', premium: 'PREMIUM' };

function DashboardTab() {
  const statsQuery = useQuery({ queryKey: ['adminDashboardStats'], queryFn: getAdminDashboardStats });

  if (statsQuery.isLoading || !statsQuery.data) return <div style={{ fontSize: 13, color: '#94A3B8' }}>Cargando…</div>;

  const stats = statsQuery.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
        <KpiCard title="Usuarios totales" value={stats.totalUsers} />
        <KpiCard title="Usuarios activos" value={stats.activeUsers} />
        <KpiCard title="Workspaces" value={stats.totalWorkspaces} />
        <KpiCard title="MRR estimado" value={fmt(stats.mrr)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Workspaces por plan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(stats.planCounts).length === 0 && <div style={{ fontSize: 12.5, color: '#94A3B8' }}>Sin datos.</div>}
            {Object.entries(stats.planCounts).map(([code, count]) => (
              <div key={code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{PLAN_LABELS[code] ?? code}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Suscripciones por estado</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(stats.statusCounts).length === 0 && <div style={{ fontSize: 12.5, color: '#94A3B8' }}>Sin datos.</div>}
            {Object.entries(stats.statusCounts).map(([status, count]) => (
              <div key={status} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{status}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: '#94A3B8' }}>Las métricas excluyen el workspace del super administrador.</p>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>{value}</div>
    </div>
  );
}

function SubscriptionsTab() {
  const entriesQuery = useQuery({ queryKey: ['adminWorkspaceSubscriptions'], queryFn: listWorkspaceSubscriptions });
  const plansQuery = useQuery({ queryKey: ['adminPlans'], queryFn: listPlans });

  if (!entriesQuery.data || !plansQuery.data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entriesQuery.data.map((entry) => (
        <SubscriptionRowEditor key={entry.workspace.id} entry={entry} plans={plansQuery.data!} />
      ))}
      {entriesQuery.data.length === 0 && <div style={{ fontSize: 13, color: '#94A3B8' }}>No hay workspaces registrados.</div>}
    </div>
  );
}

function SubscriptionRowEditor({ entry, plans }: { entry: WorkspaceSubscriptionEntry; plans: { id: string; code: string; name: string; price: number }[] }) {
  const { workspace, subscription } = entry;
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [planId, setPlanId] = useState(subscription?.plan_id ?? plans[0]?.id ?? '');
  const [status, setStatus] = useState<SubscriptionRow['status']>(subscription?.status ?? 'free');
  const [periodEnd, setPeriodEnd] = useState(subscription?.current_period_end?.slice(0, 10) ?? '');
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(subscription?.cancel_at_period_end ?? false);

  const mutation = useMutation({
    mutationFn: () =>
      updateSubscription(workspace.id, {
        plan_id: planId,
        status,
        current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
        cancel_at_period_end: cancelAtPeriodEnd,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminWorkspaceSubscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['adminDashboardStats'] });
      showToast('Suscripción actualizada');
    },
    onError: () => showToast('No se pudo actualizar la suscripción'),
  });

  if (!subscription) {
    return (
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>{workspace.name}</div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Sin suscripción registrada.</div>
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
      <div style={{ minWidth: 160, flex: '1 1 160px' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>{workspace.name}</div>
        <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{workspace.type} · {workspace.status}</div>
      </div>

      <div>
        <label style={labelStyle}>Plan</label>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} style={inputStyle}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({fmt(p.price)})</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Estado</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as SubscriptionRow['status'])} style={inputStyle}>
          {SUBSCRIPTION_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Fin del periodo</label>
        <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
        <input type="checkbox" checked={cancelAtPeriodEnd} onChange={(e) => setCancelAtPeriodEnd(e.target.checked)} id={`cape-${workspace.id}`} />
        <label htmlFor={`cape-${workspace.id}`} style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Cancela al fin del periodo</label>
      </div>

      <button onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...buttonStyle, opacity: mutation.isPending ? 0.7 : 1 }}>
        {mutation.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

function PlansTab() {
  const plansQuery = useQuery({ queryKey: ['adminPlans'], queryFn: listPlans });
  const featuresQuery = useQuery({ queryKey: ['adminPlanFeatures'], queryFn: listPlanFeatures });
  const limitsQuery = useQuery({ queryKey: ['adminPlanLimits'], queryFn: listPlanLimits });

  if (!plansQuery.data || !featuresQuery.data || !limitsQuery.data) return null;

  const featuresByCode = new Map(featuresQuery.data.map((f) => [f.plan_code, f]));
  const limitsByCode = new Map(limitsQuery.data.map((l) => [l.plan_code, l]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {plansQuery.data.map((plan) => {
        const features = featuresByCode.get(plan.code);
        const limits = limitsByCode.get(plan.code);
        return (
          <div key={plan.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{plan.name}</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: BRAND_COLORS.primary }}>{fmt(plan.price)}/mes</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8, fontSize: 12.5 }}>
              <LimitRow label="Cotizaciones/mes" value={limits?.max_quotes_month ?? '—'} />
              <LimitRow label="Clientes" value={limits?.max_clients ?? '—'} />
              <LimitRow label="Usuarios incluidos" value={limits?.included_users ?? '—'} />
              <LimitRow label="Precio usuario extra" value={limits ? fmt(limits.extra_user_price) : '—'} />
              <LimitRow label="Créditos IA/mes" value={limits?.ai_credits_monthly ?? '—'} />
              <LimitRow label="PDF" value={features?.pdf_tier ?? '—'} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {features && Object.entries(features)
                .filter(([k]) => k.endsWith('_enabled'))
                .map(([k, v]) => (
                  <span
                    key={k}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                      color: v ? '#16A34A' : '#94A3B8', background: v ? '#F0FDF4' : '#F1F5F9',
                    }}
                  >
                    {v ? '✓' : '✕'} {k.replace('_enabled', '').replace(/_/g, ' ')}
                  </span>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 4 }}>
      <span style={{ color: '#64748B' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario', admin: 'Administrador', employee: 'Empleado', super_admin: 'Super admin', support_admin: 'Soporte',
};

function UsersTab() {
  const profilesQuery = useQuery({ queryKey: ['adminAllProfiles'], queryFn: listAllProfiles });
  const [search, setSearch] = useState('');

  if (!profilesQuery.data) return null;

  const filtered = profilesQuery.data.filter((entry) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (entry.profile.full_name ?? '').toLowerCase().includes(q)
      || (entry.profile.email ?? '').toLowerCase().includes(q)
      || entry.workspaceName.toLowerCase().includes(q);
  });

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre, correo o workspace…"
        style={{ ...inputStyle, width: '100%', maxWidth: 360, marginBottom: 12, padding: '10px 13px' }}
      />
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={thStyle}>Usuario</th>
                <th style={thStyle}>Correo</th>
                <th style={thStyle}>Workspace</th>
                <th style={thStyle}>Rol</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Desde</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ profile, workspaceName }) => (
                <tr key={profile.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={tdStyle}>{profile.full_name || '—'}</td>
                  <td style={tdStyle}>{profile.email || '—'}</td>
                  <td style={tdStyle}>{workspaceName}</td>
                  <td style={tdStyle}>{ROLE_LABELS[profile.role] ?? profile.role}</td>
                  <td style={tdStyle}>{profile.status}</td>
                  <td style={tdStyle}>{new Date(profile.created_at).toLocaleDateString('es-CO')}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WorkspacesTab() {
  const entriesQuery = useQuery({ queryKey: ['adminWorkspaceSubscriptions'], queryFn: listWorkspaceSubscriptions });

  if (!entriesQuery.data) return null;

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th style={thStyle}>Workspace</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Plan</th>
              <th style={thStyle}>Suscripción</th>
              <th style={thStyle}>Creado</th>
            </tr>
          </thead>
          <tbody>
            {entriesQuery.data.map(({ workspace, subscription, plan }) => (
              <tr key={workspace.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                <td style={tdStyle}>{workspace.name}</td>
                <td style={tdStyle}>{workspace.type}</td>
                <td style={tdStyle}>{workspace.status}</td>
                <td style={tdStyle}>{plan?.name ?? '—'}</td>
                <td style={tdStyle}>{subscription?.status ?? '—'}</td>
                <td style={tdStyle}>{new Date(workspace.created_at).toLocaleDateString('es-CO')}</td>
              </tr>
            ))}
            {entriesQuery.data.length === 0 && (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>No hay workspaces registrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditTab() {
  const logQuery = useQuery({ queryKey: ['adminAuditLog'], queryFn: () => listAuditLog(200) });
  const [actionFilter, setActionFilter] = useState('all');

  if (!logQuery.data) return null;

  const actions = Array.from(new Set(logQuery.data.map((r) => r.action))).sort();
  const filtered = actionFilter === 'all' ? logQuery.data : logQuery.data.filter((r) => r.action === actionFilter);

  return (
    <div>
      <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
        <option value="all">Todas las acciones</option>
        {actions.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 600 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Acción</th>
                <th style={thStyle}>Entidad</th>
                <th style={thStyle}>Workspace</th>
                <th style={thStyle}>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={tdStyle}>{new Date(row.created_at).toLocaleString('es-CO')}</td>
                  <td style={tdStyle}><span style={{ fontWeight: 700 }}>{row.action}</span></td>
                  <td style={tdStyle}>{row.entity_type}{row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ''}</td>
                  <td style={tdStyle}>{row.workspace_id.slice(0, 8)}</td>
                  <td style={tdStyle}>{row.user_id ? row.user_id.slice(0, 8) : '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>Sin registros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IntegracionesSection() {
  const configQuery = useQuery({ queryKey: ['adminSystemConfiguration'], queryFn: listSystemConfiguration });

  if (!configQuery.data) return null;

  function isConfigured(key: string): boolean {
    const row = configQuery.data!.find((r) => r.key === key);
    if (!row || typeof row.value !== 'object' || row.value === null || Array.isArray(row.value)) return false;
    const v = row.value as Record<string, unknown>;
    return Object.values(v).some((val) => typeof val === 'string' && val.trim() !== '');
  }

  const integrations = [
    { key: 'resend', label: 'Resend (correo transaccional)' },
    { key: 'mercadopago', label: 'MercadoPago (pagos)' },
  ];

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Integraciones</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {integrations.map(({ key, label }) => {
          const configured = isConfigured(key);
          return (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{label}</span>
              <span style={{
                fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8,
                color: configured ? '#16A34A' : '#94A3B8', background: configured ? '#F0FDF4' : '#F1F5F9',
              }}>
                {configured ? 'Configurado' : 'No configurado'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfigTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <IntegracionesSection />
      <SystemConfigTab />
      <AdminSettingsTab />
    </div>
  );
}

function SystemConfigTab() {
  const configQuery = useQuery({ queryKey: ['adminSystemConfiguration'], queryFn: listSystemConfiguration });

  if (!configQuery.data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {configQuery.data.map((row) => (
        <SystemConfigEditor key={row.key} row={row} />
      ))}
    </div>
  );
}

function SystemConfigEditor({ row }: { row: SystemConfigurationRow }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [text, setText] = useState(JSON.stringify(row.value, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (value: unknown) => updateSystemConfiguration(row.key, value as SystemConfigurationRow['value']),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSystemConfiguration'] });
      showToast('Configuración actualizada');
    },
    onError: () => showToast('No se pudo actualizar la configuración'),
  });

  function handleSave() {
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      mutation.mutate(parsed);
    } catch {
      setJsonError('JSON inválido');
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>{row.key}</div>
          <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{row.category}</div>
        </div>
        <button onClick={handleSave} disabled={mutation.isPending} style={{ ...buttonStyle, opacity: mutation.isPending ? 0.7 : 1 }}>
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        style={{ width: '100%', border: `1.5px solid ${jsonError ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: 10, padding: 10, fontSize: 12.5, fontFamily: "'Space Mono',monospace", outline: 'none', resize: 'vertical' }}
      />
      {jsonError && <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 4 }}>{jsonError}</div>}
    </div>
  );
}

function AdminSettingsTab() {
  const settingsQuery = useQuery({ queryKey: ['adminSettings'], queryFn: listAdminSettings });
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) => updateAdminSetting(key, value as AdminSettingRow['value']),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSettings'] });
      showToast('Ajuste actualizado');
    },
    onError: () => showToast('No se pudo actualizar el ajuste'),
  });

  if (!settingsQuery.data) return null;

  const LABELS: Record<string, { title: string; description: string }> = {
    signup_enabled: { title: 'Registro de nuevos usuarios', description: 'Permite que nuevos usuarios creen una cuenta desde /registro.' },
    maintenance_mode: { title: 'Modo de mantenimiento', description: 'Restringe el acceso a la aplicación mientras se realizan tareas de mantenimiento.' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {settingsQuery.data.map((row) => {
        const meta = LABELS[row.key] ?? { title: row.key, description: '' };
        const enabled = row.value === true;
        return (
          <div key={row.key} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>{meta.title}</div>
              {meta.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{meta.description}</div>}
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 25, flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => mutation.mutate({ key: row.key, value: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute', inset: 0, borderRadius: 999, cursor: 'pointer', transition: '.2s',
                  background: enabled ? BRAND_COLORS.primary : '#E2E8F0',
                }}
              />
              <span
                style={{
                  position: 'absolute', top: 3, left: enabled ? 22 : 3, width: 19, height: 19, borderRadius: '50%',
                  background: '#fff', transition: '.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                }}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

function SupportTab() {
  return (
    <div style={{ ...cardStyle, textAlign: 'center', padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 40 }}>🛟</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Próximamente</div>
      <p style={{ fontSize: 13, color: '#64748B' }}>El módulo de soporte estará disponible en una futura actualización.</p>
    </div>
  );
}
