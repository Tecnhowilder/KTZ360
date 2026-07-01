/**
 * AutomatizacionesPage — Centro de Automatizaciones Sprint 13
 * /app/automatizaciones — Mobile-first 390/430px + Desktop
 * "Shelwi trabaja por ti"
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ArrowLeft, CheckCircle, Clock, Plus, AlertTriangle, BarChart2 } from 'lucide-react';
import { useAutomations, useInstallTemplates, useToggleRule } from '../hooks/useAutomations';
import { useUI } from '../features/app/UIProvider';
import { AutomationWizard } from '../components/automations/AutomationWizard';
import {
  TRIGGER_EVENT_LABELS, ACTION_TYPE_LABELS, CATEGORY_LABELS, STATUS_LABELS,
  type AutomationRule, type AutomationTemplate,
} from '../services/automations';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, color: '#64748B' };
  return <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>;
}

// ─── Sección Resumen (stats) ──────────────────────────────────────────────────

function SeccionResumen({ rules, logs, maxAuto, planCode }: {
  rules: AutomationRule[];
  logs: Array<{ status: string; created_at: string }>;
  maxAuto: number | null;
  planCode: string;
}) {
  const activeRules   = rules.filter(r => r.enabled).length;
  const today         = new Date().toDateString();
  const todayLogs     = logs.filter(l => new Date(l.created_at).toDateString() === today);
  const executedToday = todayLogs.filter(l => l.status === 'executed').length;
  const errorsToday   = todayLogs.filter(l => l.status === 'failed').length;
  const blockedToday  = todayLogs.filter(l => l.status.startsWith('blocked')).length;

  const kpis = [
    { label: 'Reglas activas',     value: `${activeRules}${maxAuto ? '/' + maxAuto : ''}`, color: '#2563EB', bg: '#EFF6FF', icon: Zap },
    { label: 'Ejecuciones hoy',    value: String(executedToday), color: '#16A34A', bg: '#F0FDF4', icon: CheckCircle },
    { label: 'Errores hoy',        value: String(errorsToday),   color: errorsToday > 0 ? '#DC2626' : '#64748B', bg: errorsToday > 0 ? '#FEF2F2' : '#F8FAFC', icon: AlertTriangle },
    { label: 'Anti-loop bloqueados', value: String(blockedToday), color: '#7C3AED', bg: '#F5F3FF', icon: BarChart2 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tagline */}
      <div style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', borderRadius: 16, padding: '14px 16px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Zap size={18} color="#fff" />
          <span style={{ fontSize: 15, fontWeight: 800 }}>Shelwi trabaja por ti</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,.8)', margin: 0, lineHeight: 1.6 }}>
          {activeRules === 0
            ? 'Activa tu primera automatización y deja que Shelwi gestione los seguimientos por ti.'
            : `${activeRules} automatización${activeRules > 1 ? 'es' : ''} activa${activeRules > 1 ? 's' : ''} — haciendo el trabajo por ti.`}
        </p>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color, marginBottom: 2 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Plan info */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>Plan {planCode.toUpperCase()}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            {maxAuto === null ? 'Reglas ilimitadas' : `Máx. ${maxAuto} reglas activas`}
          </div>
        </div>
        {activeRules >= (maxAuto ?? Infinity) && maxAuto !== null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '4px 10px', borderRadius: 99 }}>
            Límite alcanzado
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta de regla ─────────────────────────────────────────────────────────

function RuleCard({ rule, onToggle }: { rule: AutomationRule; onToggle: (enabled: boolean) => void }) {
  const actionMeta   = ACTION_TYPE_LABELS[rule.action_type];
  const triggerLabel = TRIGGER_EVENT_LABELS[rule.trigger_event] ?? rule.trigger_event;

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '14px 16px',
      boxShadow: '0 2px 8px rgba(0,0,0,.05)',
      border: rule.enabled ? '1px solid #BFDBFE' : '1px solid #F1F5F9',
      opacity: rule.enabled ? 1 : 0.7,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>{actionMeta?.icon ?? '🤖'}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rule.name}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: '#2563EB' }}>{triggerLabel}</span>
            {rule.delay_hours > 0 && (
              <span style={{ color: '#94A3B8' }}> · después de {rule.delay_hours >= 24 ? Math.floor(rule.delay_hours/24)+'d' : rule.delay_hours+'h'}</span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: '#94A3B8' }}>
            {actionMeta?.label ?? rule.action_type}
            {rule.executions_count > 0 && (
              <span style={{ marginLeft: 8, color: '#16A34A', fontWeight: 700 }}>
                · {rule.executions_count} ejecuciones
              </span>
            )}
          </div>
        </div>
        <button onClick={() => onToggle(!rule.enabled)} style={{
          width: 44, height: 24, borderRadius: 99, border: 'none',
          background: rule.enabled ? '#2563EB' : '#E2E8F0',
          cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .15s',
        }}>
          <span style={{ position: 'absolute', top: 2, left: rule.enabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
        </button>
      </div>
    </div>
  );
}

// ─── Tarjeta de template ──────────────────────────────────────────────────────

function TemplateCard({ tmpl, onInstall, loading }: {
  tmpl: AutomationTemplate; onInstall: () => void; loading: boolean;
}) {
  const catMeta    = CATEGORY_LABELS[tmpl.category];
  const actionMeta = ACTION_TYPE_LABELS[tmpl.action_type];
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.05)', border: tmpl.installed ? '1px solid #BBF7D0' : '1px solid #F1F5F9' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: catMeta?.bg ?? '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
          {actionMeta?.icon ?? '🤖'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 3 }}>{tmpl.name}</div>
          <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 8 }}>{tmpl.description ?? ''}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: catMeta?.bg, color: catMeta?.color }}>{catMeta?.label}</span>
            {tmpl.delay_hours > 0 && <span style={{ fontSize: 10.5, color: '#94A3B8' }}><Clock size={10} style={{ display: 'inline', marginRight: 3 }} />{tmpl.delay_hours}h</span>}
          </div>
        </div>
        <button onClick={onInstall} disabled={tmpl.installed || loading} style={{
          border: 'none', borderRadius: 10, padding: '7px 12px', cursor: tmpl.installed ? 'not-allowed' : 'pointer',
          background: tmpl.installed ? '#F0FDF4' : '#2563EB', color: tmpl.installed ? '#16A34A' : '#fff',
          fontSize: 12, fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {tmpl.installed ? <><CheckCircle size={12} /> Instalada</> : <><Plus size={12} /> Agregar</>}
        </button>
      </div>
    </div>
  );
}

// ─── Pantalla sin acceso ──────────────────────────────────────────────────────

function NoAccess() {
  const { openUpgradeModal } = useUI();
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Zap size={28} color="#6366F1" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>Shelwi trabaja por ti</h2>
      <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 24px', lineHeight: 1.6 }}>
        Seguimientos automáticos, recuperación de cotizaciones perdidas y alertas inteligentes. Disponible en PRO y PREMIUM.
      </p>
      <ul style={{ margin: '0 0 28px', padding: 0, listStyle: 'none', textAlign: 'left', maxWidth: 280, marginInline: 'auto' }}>
        {[
          'Cotización sin respuesta → seguimiento automático',
          'Cliente inactivo 60 días → campaña de recuperación',
          'Pedido finalizado → solicitar reseña',
          'OT retrasada → alertar al supervisor',
          'Cliente ve la cotización 3 veces → alerta de oportunidad',
        ].map(b => (
          <li key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', fontSize: 13, color: '#374151' }}>
            <CheckCircle size={15} color="#22C55E" style={{ flexShrink: 0, marginTop: 1 }} />
            {b}
          </li>
        ))}
      </ul>
      <button onClick={() => openUpgradeModal({ title: 'Automatizaciones — PREMIUM', message: 'Shelwi trabaja por ti mientras te dedicas a lo que importa.', targetPlan: 'premium', ctaLabel: 'Actualizar a PREMIUM' })}
        style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%', maxWidth: 300 }}>
        Activar automatizaciones
      </button>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

type TabKey = 'resumen' | 'reglas' | 'templates' | 'historial';

export function AutomatizacionesPage() {
  const navigate      = useNavigate();
  const autoQ         = useAutomations();
  const installMut    = useInstallTemplates();
  const toggleMut     = useToggleRule();
  const [tab, setTab] = useState<TabKey>('resumen');
  const [wizard, setWizard] = useState(false);

  const data    = autoQ.data;
  const isError = autoQ.isError || (data && data.max_automations === 0);

  if (isError) {
    return (
      <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ArrowLeft size={20} /></button>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Automatizaciones</div>
        </div>
        <NoAccess />
      </div>
    );
  }

  const rules     = data?.rules ?? [];
  const templates = data?.templates ?? [];
  const logs      = data?.recent_logs ?? [];
  const maxAuto   = data?.max_automations ?? null;
  const planCode  = data?.plan_code ?? 'pro';
  const activeCount = rules.filter(r => r.enabled).length;

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'resumen',   label: 'Resumen' },
    { key: 'reglas',    label: `Reglas (${rules.length})` },
    { key: 'templates', label: 'Templates' },
    { key: 'historial', label: 'Historial' },
  ];

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F172A' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={18} color="#6366F1" /> Automatizaciones
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>
              {activeCount} activas{maxAuto ? ` · máx ${maxAuto}` : ' · ilimitadas'}
            </div>
          </div>
          <button
            onClick={() => setWizard(true)}
            disabled={maxAuto !== null && activeCount >= maxAuto}
            style={{
              border: 'none', background: (maxAuto !== null && activeCount >= maxAuto) ? '#F1F5F9' : '#0F172A',
              color: (maxAuto !== null && activeCount >= maxAuto) ? '#94A3B8' : '#fff',
              borderRadius: 11, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Nueva
          </button>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flexShrink: 0, flex: 1, padding: '9px 0', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? '#2563EB' : '#94A3B8',
              borderBottom: tab === t.key ? '2px solid #2563EB' : '2px solid transparent',
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding: '14px 16px 0' }}>
        {autoQ.isLoading ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>Cargando...</div>
        ) : (
          <>
            {tab === 'resumen' && (
              <SeccionResumen rules={rules} logs={logs} maxAuto={maxAuto} planCode={planCode} />
            )}
            {tab === 'reglas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rules.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>🤖</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>Sin automatizaciones configuradas</div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'center' }}>
                      <button onClick={() => setTab('templates')} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: 12, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                        Ver templates
                      </button>
                      <button onClick={() => setWizard(true)} style={{ border: 'none', background: '#0F172A', color: '#fff', borderRadius: 12, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Plus size={13} /> Crear regla
                      </button>
                    </div>
                  </div>
                ) : (
                  rules.map(rule => (
                    <RuleCard key={rule.id} rule={rule}
                      onToggle={(enabled) => {
                        if (enabled && maxAuto !== null && activeCount >= maxAuto) { return; }
                        toggleMut.mutate({ ruleId: rule.id, enabled });
                      }}
                    />
                  ))
                )}
              </div>
            )}
            {tab === 'templates' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, background: '#EEF2FF', borderRadius: 12, padding: '10px 14px', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: '#6366F1' }}>Templates predefinidos</span> — instálalos y actívalos cuando estés listo. Comienzan desactivados.
                </div>
                {templates.map(tmpl => (
                  <TemplateCard key={tmpl.key} tmpl={tmpl} loading={installMut.isPending}
                    onInstall={() => installMut.mutate([tmpl.key])}
                  />
                ))}
                {templates.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>Sin templates para tu plan</div>
                )}
              </div>
            )}
            {tab === 'historial' && (
              <div>
                {logs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>Sin ejecuciones todavía</div>
                ) : (
                  <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                    {logs.map((log, i) => (
                      <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < logs.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.rule_name ?? 'Regla eliminada'}
                          </div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>
                            {TRIGGER_EVENT_LABELS[log.trigger_event ?? ''] ?? log.trigger_event}
                            {' · '}
                            {new Date(log.created_at).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <StatusBadge status={log.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Wizard No-Code */}
      {wizard && (
        <AutomationWizard
          onClose={() => setWizard(false)}
          onSuccess={() => { setWizard(false); setTab('reglas'); autoQ.refetch(); }}
        />
      )}
    </div>
  );
}
