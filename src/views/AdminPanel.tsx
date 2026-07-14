/**
 * AdminPanel.tsx — Backoffice Shelwi (Sprint 9)
 * Acceso: super_admin (CRUD completo) + support_admin (lectura + soporte)
 * Ruta: /app/admin — protegida por RequireSuperAdmin
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { isSuperAdmin } from '../lib/permissions';
import { supabase } from '../lib/supabaseClient';
import {
  listWorkspaceSubscriptions,
  listPlans,
  updateSubscription,
  listSystemConfiguration,
  updateSystemConfiguration,
  listAdminSettings,
  updateAdminSetting,
  getAdminDashboardStats,
  listAllProfiles,
  getAuditLogPaged,
  suspendWorkspace,
  reactivateWorkspace,
  changeUserRole,
  setUserStatus,
  sendAdminNotification,
  listAllInvitations,
  adminRevokeInvitation,
  type WorkspaceSubscriptionEntry,
  type AuditLogFilters,
} from '../services/admin';
import { PlansEditor }              from '../components/admin/PlansEditor';
import { FounderTab }              from '../components/admin/FounderTab';
import { IAAdminTab }              from '../components/admin/IAAdminTab';
import { IAOrchestratorTab }       from '../components/admin/IAOrchestratorTab';
import { StorageAdminTab }         from '../components/admin/StorageAdminTab';
import { CustomerExperienceTab }   from '../components/admin/CustomerExperienceTab';
import { FeatureFlagsTab }         from '../components/admin/FeatureFlagsTab';
import { PushTemplatesTab }        from '../components/admin/PushTemplatesTab';
import { ObservabilityTab }        from '../components/admin/ObservabilityTab';
import { HealthChecksTab }         from '../components/admin/HealthChecksTab';
import { UserSupportPanel }        from '../components/admin/UserSupportPanel';
import { EmailTemplatesTab }       from '../components/admin/EmailTemplatesTab';
import type { SubscriptionRow, SystemConfigurationRow, AdminSettingRow } from '../lib/database.types';
import { useToast } from '../components/ui/Toast';
import { fmt } from '../lib/calc';
import { BRAND_COLORS } from '../lib/brand';
import { useAdminFinanceSummary } from '../hooks/useFinance';
import { formatCurrencyCOPCompact } from '../lib/currency';

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const cardStyle:   React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 18 };
const inputStyle:  React.CSSProperties = { border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none' };
const labelStyle:  React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4, letterSpacing: '.04em', textTransform: 'uppercase' as const };
const buttonStyle: React.CSSProperties = { border: 'none', background: BRAND_COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 9, cursor: 'pointer' };
const thStyle:     React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 800, color: '#94A3B8', letterSpacing: '.5px', borderBottom: '1px solid #EEF2F7', textAlign: 'left' as const, whiteSpace: 'nowrap' as const };
const tdStyle:     React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' as const, fontSize: 12.5 };

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'subscriptions' | 'plans' | 'founder' | 'ia' | 'orchestrator' | 'storage'
         | 'users' | 'workspaces' | 'invitations' | 'audit' | 'system' | 'support'
         | 'finanzas' | 'cx' | 'flags' | 'push_templates' | 'observability' | 'email_templates' | 'health';

const TAB_LABELS: Record<Tab, string> = {
  dashboard:       'Dashboard',
  subscriptions:   'Suscripciones',
  plans:           'Planes & Features',
  founder:         'Founder Program',
  ia:              'IA Admin',
  orchestrator:    '🤖 Orchestrator',
  storage:         'Storage',
  users:           'Usuarios',
  workspaces:      'Workspaces',
  invitations:     'Invitaciones',
  audit:           'Auditoría',
  system:          'Configuración',
  support:         'Soporte',
  finanzas:        'Finanzas Shelwi',
  cx:              'Customer Experience',
  flags:           '⚑ Feature Flags',
  push_templates:  '🔔 Push Templates',
  observability:   '📊 Observabilidad',
  email_templates: '✉️ Email Templates',
  health:          '🟢 Salud',
};

// ─── AdminPanel root ──────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = { free: 'FREE', pro: 'PRO', premium: 'PREMIUM' };

export function AdminPanel() {
  const adminQuery      = useQuery({ queryKey: ['isSuperAdmin'],       queryFn: isSuperAdmin });
  const superAdminQuery = useQuery({ queryKey: ['isStrictSuperAdmin'], queryFn: async () => { const r = await supabase.rpc('is_super_admin'); return Boolean(r.data); } });
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) ?? 'dashboard';

  if (adminQuery.isLoading) return null;
  if (!adminQuery.data) return (
    <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Acceso restringido</h1>
      <p style={{ fontSize: 13.5, color: '#64748B' }}>Esta sección es exclusiva para super administradores y soporte.</p>
    </div>
  );

  const canEdit      = adminQuery.data === true;
  const isSuperAdm   = superAdminQuery.data === true;
  const tabs: Tab[]  = ['dashboard','subscriptions','plans','founder','ia','orchestrator','storage','users','workspaces','invitations','audit','system','support','finanzas','cx','flags','push_templates','observability','email_templates','health'];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Panel de administración</h1>
      <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>Gestión global de Shelwi · CMS sin código.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#EEF2F7', padding: 4, borderRadius: 14, marginBottom: 18, flexWrap: 'wrap', maxWidth: 900 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setSearchParams({ tab: t })} style={{
            border: 'none', background: tab === t ? '#fff' : 'transparent',
            color: tab === t ? '#0F172A' : '#64748B', fontWeight: 700, fontSize: 12,
            padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
            boxShadow: tab === t ? '0 2px 6px rgba(15,23,42,.1)' : 'none',
          }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'dashboard'     && <DashboardTab />}
      {tab === 'subscriptions' && <SubscriptionsTab />}
      {tab === 'plans'         && <PlansEditor canEdit={canEdit} />}
      {tab === 'founder'       && <FounderTab  canEdit={canEdit} />}
      {tab === 'ia'            && <IAAdminTab  canEdit={canEdit} />}
      {tab === 'orchestrator'  && <IAOrchestratorTab />}
      {tab === 'storage'       && <StorageAdminTab />}
      {tab === 'users'         && <UsersTab    canEdit={canEdit} isSuperAdmin={isSuperAdm} />}
      {tab === 'workspaces'    && <WorkspacesTab canEdit={canEdit} />}
      {tab === 'invitations'   && <InvitationsTab />}
      {tab === 'audit'         && <AuditTab />}
      {tab === 'system'        && <ConfigTab />}
      {tab === 'support'       && <SupportTab />}
      {tab === 'finanzas'      && <FinanzasAdminTab />}
      {tab === 'cx'            && <CustomerExperienceTab />}
      {tab === 'flags'         && <FeatureFlagsTab   canEdit={canEdit} />}
      {tab === 'push_templates'&& <PushTemplatesTab  canEdit={canEdit} />}
      {tab === 'observability'   && <ObservabilityTab />}
      {tab === 'email_templates' && <EmailTemplatesTab canEdit={canEdit} />}
      {tab === 'health'          && <HealthChecksTab />}
    </div>
  );
}

// ─── DashboardTab (existente, sin cambios) ────────────────────────────────────

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
          {Object.entries(stats.planCounts).map(([code, count]) => (
            <div key={code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span style={{ fontWeight: 700 }}>{PLAN_LABELS[code] ?? code}</span><span>{count}</span>
            </div>
          ))}
        </div>
        <div style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Suscripciones por estado</div>
          {Object.entries(stats.statusCounts).map(([status, count]) => (
            <div key={status} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span style={{ fontWeight: 700 }}>{status}</span><span>{count}</span>
            </div>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: '#94A3B8' }}>Las métricas excluyen el workspace del super administrador.</p>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A' }}>{value}</div>
    </div>
  );
}

// ─── SubscriptionsTab (existente, sin cambios) ────────────────────────────────

const SUBSCRIPTION_STATUSES: SubscriptionRow['status'][] = [
  'trial_active','active','past_due','cancelled','expired','suspended','free',
];

function SubscriptionsTab() {
  const entriesQ = useQuery({ queryKey: ['adminWorkspaceSubscriptions'], queryFn: listWorkspaceSubscriptions });
  const plansQ   = useQuery({ queryKey: ['adminPlans'],                  queryFn: listPlans });
  if (!entriesQ.data || !plansQ.data) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entriesQ.data.map(entry => <SubscriptionRowEditor key={entry.workspace.id} entry={entry} plans={plansQ.data!} />)}
      {entriesQ.data.length === 0 && <div style={{ fontSize: 13, color: '#94A3B8' }}>No hay workspaces.</div>}
    </div>
  );
}

function SubscriptionRowEditor({ entry, plans }: { entry: WorkspaceSubscriptionEntry; plans: { id: string; code: string; name: string; price: number }[] }) {
  const { workspace, subscription } = entry;
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [planId, setPlanId] = useState(subscription?.plan_id ?? plans[0]?.id ?? '');
  const [status, setStatus] = useState<SubscriptionRow['status']>(subscription?.status ?? 'free');
  const [periodEnd, setPeriodEnd] = useState(subscription?.current_period_end?.slice(0,10) ?? '');
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(subscription?.cancel_at_period_end ?? false);

  const mutation = useMutation({
    mutationFn: () => updateSubscription(workspace.id, { plan_id: planId, status, current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null, cancel_at_period_end: cancelAtPeriodEnd }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminWorkspaceSubscriptions'] }); qc.invalidateQueries({ queryKey: ['adminDashboardStats'] }); showToast('Suscripción actualizada'); },
    onError: () => showToast('Error al actualizar'),
  });

  if (!subscription) return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>{workspace.name}</div>
      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Sin suscripción.</div>
    </div>
  );
  return (
    <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
      <div style={{ minWidth: 160, flex: '1 1 160px' }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{workspace.name}</div>
        <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{workspace.type} · {workspace.status}</div>
      </div>
      <div><label style={labelStyle}>Plan</label>
        <select value={planId} onChange={e => setPlanId(e.target.value)} style={inputStyle}>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({fmt(p.price)})</option>)}
        </select>
      </div>
      <div><label style={labelStyle}>Estado</label>
        <select value={status} onChange={e => setStatus(e.target.value as SubscriptionRow['status'])} style={inputStyle}>
          {SUBSCRIPTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div><label style={labelStyle}>Fin del periodo</label>
        <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
        <input type="checkbox" checked={cancelAtPeriodEnd} onChange={e => setCancelAtPeriodEnd(e.target.checked)} id={`cape-${workspace.id}`} />
        <label htmlFor={`cape-${workspace.id}`} style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Cancela al fin</label>
      </div>
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...buttonStyle, opacity: mutation.isPending ? .7 : 1 }}>
        {mutation.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

// ─── UsersTab (extendido con acciones) ────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario', admin: 'Administrador', employee: 'Empleado',
  super_admin: 'Super admin', support_admin: 'Soporte',
};

function UsersTab({ canEdit, isSuperAdmin }: { canEdit: boolean; isSuperAdmin: boolean }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const profilesQ = useQuery({ queryKey: ['adminAllProfiles'], queryFn: listAllProfiles });
  const [search, setSearch] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => changeUserRole(userId, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminAllProfiles'] }); showToast('Rol actualizado'); },
    onError: (e: any) => showToast(e.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'inactive' }) => setUserStatus(userId, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminAllProfiles'] }); showToast('Estado actualizado'); },
    onError: (e: any) => showToast(e.message),
  });

  if (!profilesQ.data) return null;

  const filtered = profilesQ.data.filter(({ profile, workspaceName }) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (profile.full_name ?? '').toLowerCase().includes(q)
      || (profile.email ?? '').toLowerCase().includes(q)
      || workspaceName.toLowerCase().includes(q);
  });

  const colSpan = canEdit ? 8 : 7;

  return (
    <div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nombre, correo o workspace…"
        style={{ ...inputStyle, width: '100%', maxWidth: 360, marginBottom: 12, padding: '10px 13px' }} />
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
                <th style={thStyle}>Soporte</th>
                {canEdit && <th style={thStyle}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ profile, workspaceName }) => {
                const isExpanded = expandedUserId === profile.id;
                return (
                  <>
                    <tr key={profile.id} style={{ borderTop: '1px solid #F1F5F9', background: isExpanded ? '#F8FAFF' : undefined }}>
                      <td style={tdStyle}>{profile.full_name || '—'}</td>
                      <td style={tdStyle}>{profile.email || '—'}</td>
                      <td style={tdStyle}>{workspaceName}</td>
                      <td style={tdStyle}>
                        {canEdit && !['super_admin','support_admin'].includes(profile.role) ? (
                          <select
                            value={profile.role}
                            onChange={e => roleMut.mutate({ userId: profile.id, role: e.target.value })}
                            style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}
                          >
                            {['owner','admin','employee'].map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                        ) : ROLE_LABELS[profile.role] ?? profile.role}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                          color: profile.status === 'active' ? '#16A34A' : '#94A3B8',
                          background: profile.status === 'active' ? '#F0FDF4' : '#F1F5F9' }}>
                          {profile.status}
                        </span>
                      </td>
                      <td style={tdStyle}>{new Date(profile.created_at).toLocaleDateString('es-CO')}</td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => setExpandedUserId(isExpanded ? null : profile.id)}
                          style={{ ...buttonStyle, padding: '4px 10px', fontSize: 11,
                            background: isExpanded ? '#EFF6FF' : '#F8FAFC',
                            color: isExpanded ? '#2563EB' : '#64748B',
                            border: `1px solid ${isExpanded ? '#BFDBFE' : '#E2E8F0'}` }}
                        >
                          {isExpanded ? '▲ Cerrar' : '⚙ Soporte'}
                        </button>
                      </td>
                      {canEdit && (
                        <td style={tdStyle}>
                          {!['super_admin','support_admin'].includes(profile.role) && (
                            <button
                              onClick={() => statusMut.mutate({ userId: profile.id, status: profile.status === 'active' ? 'inactive' : 'active' })}
                              style={{ ...buttonStyle, padding: '4px 10px', fontSize: 11,
                                background: profile.status === 'active' ? '#FEE2E2' : '#F0FDF4',
                                color: profile.status === 'active' ? '#DC2626' : '#16A34A' }}
                            >
                              {profile.status === 'active' ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr key={`support-${profile.id}`}>
                        <td colSpan={colSpan} style={{ padding: 0, borderTop: '2px solid #BFDBFE' }}>
                          <div style={{ padding: '12px 16px', background: '#F8FAFF' }}>
                            <UserSupportPanel
                              userId={profile.id}
                              email={profile.email ?? ''}
                              userName={profile.full_name ?? profile.email ?? profile.id}
                              isSuperAdmin={isSuperAdmin}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={colSpan} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>Sin resultados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── WorkspacesTab (extendido con acciones) ───────────────────────────────────

function WorkspacesTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const entriesQ = useQuery({ queryKey: ['adminWorkspaceSubscriptions'], queryFn: listWorkspaceSubscriptions });

  const suspendMut = useMutation({
    mutationFn: (wsId: string) => suspendWorkspace(wsId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminWorkspaceSubscriptions'] }); showToast('Workspace suspendido'); },
    onError: (e: any) => showToast(e.message),
  });

  const reactivateMut = useMutation({
    mutationFn: (wsId: string) => reactivateWorkspace(wsId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminWorkspaceSubscriptions'] }); showToast('Workspace reactivado'); },
    onError: (e: any) => showToast(e.message),
  });

  if (!entriesQ.data) return null;

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
              {canEdit && <th style={thStyle}>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {entriesQ.data.map(({ workspace, subscription, plan }) => (
              <tr key={workspace.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                <td style={tdStyle}>{workspace.name}</td>
                <td style={tdStyle}>{workspace.type}</td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                    color: workspace.status === 'active' ? '#16A34A' : workspace.status === 'suspended' ? '#DC2626' : '#94A3B8',
                    background: workspace.status === 'active' ? '#F0FDF4' : workspace.status === 'suspended' ? '#FEE2E2' : '#F1F5F9' }}>
                    {workspace.status}
                  </span>
                </td>
                <td style={tdStyle}>{plan?.name ?? '—'}</td>
                <td style={tdStyle}>{subscription?.status ?? '—'}</td>
                <td style={tdStyle}>{new Date(workspace.created_at).toLocaleDateString('es-CO')}</td>
                {canEdit && (
                  <td style={tdStyle}>
                    {workspace.status !== 'suspended' ? (
                      <button
                        onClick={() => suspendMut.mutate(workspace.id)}
                        style={{ ...buttonStyle, background: '#FEE2E2', color: '#DC2626', padding: '4px 10px', fontSize: 11 }}>
                        Suspender
                      </button>
                    ) : (
                      <button
                        onClick={() => reactivateMut.mutate(workspace.id)}
                        style={{ ...buttonStyle, background: '#F0FDF4', color: '#16A34A', padding: '4px 10px', fontSize: 11 }}>
                        Reactivar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {entriesQ.data.length === 0 && <tr><td colSpan={canEdit ? 7 : 6} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>Sin workspaces.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── InvitationsTab — invitaciones de TODOS los workspaces (cross-tenant) ─────

const INVITATION_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  pending: { color: '#D97706', bg: '#FFFBEB' },
  accepted: { color: '#16A34A', bg: '#F0FDF4' },
  revoked: { color: '#DC2626', bg: '#FEE2E2' },
  expired: { color: '#94A3B8', bg: '#F1F5F9' },
};

function InvitationsTab() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const entriesQ = useQuery({ queryKey: ['adminAllInvitations'], queryFn: listAllInvitations });

  const revokeMut = useMutation({
    mutationFn: (id: string) => adminRevokeInvitation(id, 'Revocada desde el CMS por administrador'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminAllInvitations'] }); showToast('Invitación revocada'); },
    onError: (e: any) => showToast(e.message),
  });

  if (!entriesQ.data) return null;

  return (
    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th style={thStyle}>Workspace</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Rol</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Invitada</th>
              <th style={thStyle}>Expira</th>
              <th style={thStyle}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {entriesQ.data.map((inv) => {
              const statusStyle = INVITATION_STATUS_STYLE[inv.status] ?? INVITATION_STATUS_STYLE.expired;
              return (
                <tr key={inv.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={tdStyle}>{inv.workspace_name ?? '—'}</td>
                  <td style={tdStyle}>{inv.email}</td>
                  <td style={tdStyle}>{inv.role}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8, color: statusStyle.color, background: statusStyle.bg }}>
                      {inv.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{new Date(inv.created_at).toLocaleString('es-CO')}</td>
                  <td style={tdStyle}>{new Date(inv.expires_at).toLocaleString('es-CO')}</td>
                  <td style={tdStyle}>
                    {inv.status === 'pending' && (
                      <button
                        onClick={() => revokeMut.mutate(inv.id)}
                        style={{ ...buttonStyle, background: '#FEE2E2', color: '#DC2626', padding: '4px 10px', fontSize: 11 }}>
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {entriesQ.data.length === 0 && <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>Sin invitaciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── AuditTab (extendido con filtros y paginación) ────────────────────────────

function AuditTab() {
  const [page, setPage]               = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');
  const PAGE_SIZE = 50;

  const filters: AuditLogFilters = {
    limit: PAGE_SIZE, offset: page * PAGE_SIZE,
    action:   actionFilter || undefined,
    fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
    toDate:   toDate   ? new Date(toDate + 'T23:59:59').toISOString() : undefined,
  };

  const logQ = useQuery({
    queryKey: ['adminAuditLog', filters],
    queryFn:  () => getAuditLogPaged(filters),
  });

  const rows  = logQ.data?.rows  ?? [];
  const total = logQ.data?.total ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><label style={labelStyle}>Acción</label>
          <input value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}
            placeholder="subscription_changed…" style={{ ...inputStyle, width: 200 }} />
        </div>
        <div><label style={labelStyle}>Desde</label>
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(0); }} style={inputStyle} />
        </div>
        <div><label style={labelStyle}>Hasta</label>
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(0); }} style={inputStyle} />
        </div>
        <button onClick={() => { setActionFilter(''); setFromDate(''); setToDate(''); setPage(0); }}
          style={{ ...buttonStyle, background: '#E2E8F0', color: '#374151', padding: '8px 12px' }}>
          Limpiar
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#94A3B8' }}>
        {total} registros · Página {page + 1}/{Math.max(1, pages)}
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 560 }}>
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
              {rows.map(row => (
                <tr key={row.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={tdStyle}>{new Date(row.created_at).toLocaleString('es-CO')}</td>
                  <td style={tdStyle}><span style={{ fontWeight: 700 }}>{row.action}</span></td>
                  <td style={tdStyle}>{row.entity_type}{row.entity_id ? ` · ${row.entity_id.slice(0,8)}` : ''}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{row.workspace_id.slice(0,8)}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{row.user_id?.slice(0,8) ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>Sin registros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            style={{ ...buttonStyle, opacity: page === 0 ? .4 : 1, background: '#E2E8F0', color: '#374151' }}>
            ← Anterior
          </button>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
            style={{ ...buttonStyle, opacity: page >= pages - 1 ? .4 : 1 }}>
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ConfigTab (existente, sin cambios) ──────────────────────────────────────

function ConfigTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <IntegracionesSection />
      <SystemConfigSection />
      <AdminSettingsSection />
    </div>
  );
}

function IntegracionesSection() {
  const configQ = useQuery({ queryKey: ['adminSystemConfiguration'], queryFn: listSystemConfiguration });
  if (!configQ.data) return null;
  function isConfigured(key: string) {
    const row = configQ.data!.find(r => r.key === key);
    if (!row || typeof row.value !== 'object' || row.value === null || Array.isArray(row.value)) return false;
    return Object.values(row.value as Record<string, unknown>).some(v => typeof v === 'string' && v.trim() !== '');
  }
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Integraciones</div>
      {[{ key: 'resend', label: 'Resend (correo)' }, { key: 'mercadopago', label: 'MercadoPago' }].map(({ key, label }) => {
        const ok = isConfigured(key);
        return (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8, color: ok ? '#16A34A' : '#94A3B8', background: ok ? '#F0FDF4' : '#F1F5F9' }}>
              {ok ? 'Configurado' : 'No configurado'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SystemConfigSection() {
  const configQ = useQuery({ queryKey: ['adminSystemConfiguration'], queryFn: listSystemConfiguration });
  if (!configQ.data) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {configQ.data.map(row => <SystemConfigEditor key={row.key} row={row} />)}
    </div>
  );
}

function SystemConfigEditor({ row }: { row: SystemConfigurationRow }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [text, setText]         = useState(JSON.stringify(row.value, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (value: unknown) => updateSystemConfiguration(row.key, value as SystemConfigurationRow['value']),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['adminSystemConfiguration'] }); showToast('Configuración actualizada'); },
    onError:    () => showToast('Error al actualizar'),
  });

  function handleSave() {
    try { const parsed = JSON.parse(text); setJsonError(null); mutation.mutate(parsed); }
    catch { setJsonError('JSON inválido'); }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{row.key}</div>
          <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{row.category}</div>
        </div>
        <button onClick={handleSave} disabled={mutation.isPending} style={{ ...buttonStyle, opacity: mutation.isPending ? .7 : 1 }}>
          {mutation.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
        style={{ width: '100%', border: `1.5px solid ${jsonError ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: 10, padding: 10, fontSize: 12.5, fontFamily: "'Space Mono',monospace", outline: 'none', resize: 'vertical' as const }} />
      {jsonError && <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 4 }}>{jsonError}</div>}
    </div>
  );
}

function AdminSettingsSection() {
  const settingsQ = useQuery({ queryKey: ['adminSettings'], queryFn: listAdminSettings });
  const qc2        = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) => updateAdminSetting(key, value as AdminSettingRow['value']),
    onSuccess: () => { qc2.invalidateQueries({ queryKey: ['adminSettings'] }); showToast('Ajuste actualizado'); },
    onError: () => showToast('Error'),
  });

  if (!settingsQ.data) return null;

  const LABELS: Record<string, { title: string; description: string }> = {
    signup_enabled:   { title: 'Registro de nuevos usuarios', description: 'Permite crear cuentas desde /registro.' },
    maintenance_mode: { title: 'Modo de mantenimiento',        description: 'Restringe el acceso a la app.' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {settingsQ.data.map(row => {
        const meta    = LABELS[row.key] ?? { title: row.key, description: '' };
        const enabled = row.value === true;
        return (
          <div key={row.key} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{meta.title}</div>
              {meta.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{meta.description}</div>}
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 25, flexShrink: 0, cursor: 'pointer' }}>
              <input type="checkbox" checked={enabled}
                onChange={e => mutation.mutate({ key: row.key, value: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', inset: 0, borderRadius: 999, transition: '.2s', background: enabled ? BRAND_COLORS.primary : '#E2E8F0' }} />
              <span style={{ position: 'absolute', top: 3, left: enabled ? 22 : 3, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: '.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            </label>
          </div>
        );
      })}
    </div>
  );
}

// ─── SupportTab (implementado) ────────────────────────────────────────────────

function SupportTab() {
  const { showToast } = useToast();
  const entriesQ = useQuery({ queryKey: ['adminWorkspaceSubscriptions'], queryFn: listWorkspaceSubscriptions });
  const [wsId, setWsId]     = useState('');
  const [title, setTitle]   = useState('');
  const [message, setMessage] = useState('');
  const [type, setType]     = useState('info');

  const notifMut = useMutation({
    mutationFn: () => sendAdminNotification(wsId, title, message, type),
    onSuccess: () => { showToast('Notificación enviada ✓'); setTitle(''); setMessage(''); setWsId(''); },
    onError: (e: any) => showToast(e.message),
  });

  const entries = entriesQ.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Enviar notificación */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Enviar notificación administrativa</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Workspace destino</label>
            <select value={wsId} onChange={e => setWsId(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
              <option value="">— Selecciona —</option>
              {entries.map(e => (
                <option key={e.workspace.id} value={e.workspace.id}>{e.workspace.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
              {['info','success','warning','danger'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título de la notificación"
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Mensaje</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
              placeholder="Mensaje para el workspace…"
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const, fontFamily: 'inherit' }} />
          </div>
        </div>
        <button
          onClick={() => notifMut.mutate()}
          disabled={!wsId || !title || !message || notifMut.isPending}
          style={{ ...buttonStyle, marginTop: 12, opacity: (!wsId || !title || !message) ? .5 : 1 }}>
          {notifMut.isPending ? 'Enviando…' : 'Enviar notificación'}
        </button>
      </div>

      {/* Búsqueda rápida */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Búsqueda de workspaces</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={thStyle}>Nombre</th>
                <th style={thStyle}>Plan</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Suscripción</th>
                <th style={thStyle}>Creado</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 20).map(({ workspace, subscription, plan }) => (
                <tr key={workspace.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={tdStyle}>{workspace.name}</td>
                  <td style={tdStyle}>{plan?.name ?? '—'}</td>
                  <td style={tdStyle}>{workspace.status}</td>
                  <td style={tdStyle}>{subscription?.status ?? '—'}</td>
                  <td style={tdStyle}>{new Date(workspace.created_at).toLocaleDateString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── FinanzasAdminTab — Finanzas de Shelwi (MRR/ARR/Growth/Addons) ───────────

function FinanzasAdminTab() {
  const q = useAdminFinanceSummary();
  if (q.isLoading) return <div style={{ fontSize: 13, color: '#94A3B8' }}>Calculando...</div>;
  if (!q.data) return <div style={{ fontSize: 13, color: '#DC2626' }}>Error al cargar datos financieros</div>;
  const d = q.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPIs SaaS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
        {([
          { label: 'MRR', value: formatCurrencyCOPCompact(d.saas.mrr), color: '#16A34A', bg: '#F0FDF4' },
          { label: 'ARR', value: formatCurrencyCOPCompact(d.saas.arr), color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Workspaces activos', value: d.saas.active_workspaces, color: '#7C3AED', bg: '#F5F3FF' },
          { label: 'Crecimiento neto 30d', value: (d.growth.net_growth_30d >= 0 ? '+' : '') + d.growth.net_growth_30d,
            color: d.growth.net_growth_30d >= 0 ? '#16A34A' : '#DC2626', bg: '#FFF' },
        ] as const).map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Por plan */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Distribución por plan</div>
        {[
          { plan: 'FREE',    count: d.saas.by_plan.free,    color: '#64748B', price: 0 },
          { plan: 'PRO',     count: d.saas.by_plan.pro,     color: '#2563EB', price: 149000 },
          { plan: 'PREMIUM', count: d.saas.by_plan.premium, color: '#7C3AED', price: 349000 },
        ].map(p => (
          <div key={p.plan} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: p.color }}>{p.plan}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#64748B' }}>{p.count} ws</span>
              {p.price > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>{formatCurrencyCOPCompact(p.count * p.price)}/mes</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Addons */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Ingresos por Addons</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: 13, color: '#374151' }}>🗄️ Storage addons</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>{formatCurrencyCOPCompact(d.addons.storage_monthly_revenue)}/mes</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ fontSize: 13, color: '#374151' }}>🤖 Costo IA (30d)</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>USD ${d.addons.ai_cost_usd_30d.toFixed(2)}</span>
        </div>
      </div>

      {/* Growth */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Crecimiento (últimos 30 días)</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: '#F0FDF4', borderRadius: 12, padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A' }}>+{d.growth.new_workspaces_30d}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>Nuevos</div>
          </div>
          <div style={{ flex: 1, background: '#FEF2F2', borderRadius: 12, padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#DC2626' }}>{d.growth.churned_workspaces_30d}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>Churn</div>
          </div>
          <div style={{ flex: 1, background: d.growth.net_growth_30d >= 0 ? '#F0FDF4' : '#FEF2F2', borderRadius: 12, padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: d.growth.net_growth_30d >= 0 ? '#16A34A' : '#DC2626' }}>
              {d.growth.net_growth_30d >= 0 ? '+' : ''}{d.growth.net_growth_30d}
            </div>
            <div style={{ fontSize: 11, color: '#64748B' }}>Neto</div>
          </div>
        </div>
      </div>
    </div>
  );
}
