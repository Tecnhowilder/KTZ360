import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isSuperAdmin } from '../lib/permissions';
import {
  listWorkspaceSubscriptions,
  listPlans,
  updateSubscription,
  listSystemConfiguration,
  updateSystemConfiguration,
  listAdminSettings,
  updateAdminSetting,
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

type Tab = 'subscriptions' | 'system' | 'settings';

export function AdminPanel() {
  const adminQuery = useQuery({ queryKey: ['isSuperAdmin'], queryFn: isSuperAdmin });
  const [tab, setTab] = useState<Tab>('subscriptions');

  if (adminQuery.isLoading) return null;

  if (!adminQuery.data) {
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Acceso restringido</h1>
        <p style={{ fontSize: 13.5, color: '#64748B' }}>Esta sección es exclusiva para super administradores.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'subscriptions', label: 'Suscripciones' },
    { id: 'system', label: 'Configuración del sistema' },
    { id: 'settings', label: 'Ajustes generales' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Panel de administración</h1>
      <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>Gestión global de suscripciones y configuración de KTZ360.</p>

      <div style={{ display: 'flex', gap: 6, background: '#EEF2F7', padding: 5, borderRadius: 14, marginBottom: 18, maxWidth: 480 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, border: 'none', background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#0F172A' : '#64748B',
              fontWeight: 700, fontSize: 12.5, padding: 10, borderRadius: 10, cursor: 'pointer',
              boxShadow: tab === t.id ? '0 2px 6px rgba(15,23,42,.1)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'subscriptions' && <SubscriptionsTab />}
      {tab === 'system' && <SystemConfigTab />}
      {tab === 'settings' && <AdminSettingsTab />}
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
