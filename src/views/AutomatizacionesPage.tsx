/**
 * AutomatizacionesPage — Centro de Automatizaciones Sprint 13
 * /app/automatizaciones — Mobile-first 390/430px
 * "Shelwi trabaja por ti"
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ArrowLeft, CheckCircle, Clock, Plus } from 'lucide-react';
import { useAutomations, useInstallTemplates, useToggleRule } from '../hooks/useAutomations';
import { useUI } from '../features/app/UIProvider';
import {
  TRIGGER_EVENT_LABELS, ACTION_TYPE_LABELS, CATEGORY_LABELS, STATUS_LABELS,
  type AutomationRule, type AutomationTemplate,
} from '../services/automations';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] ?? { label: status, color: '#64748B' };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── Tarjeta de regla ─────────────────────────────────────────────────────────

function RuleCard({ rule, onToggle }: { rule: AutomationRule; onToggle: (enabled: boolean) => void }) {
  const actionMeta = ACTION_TYPE_LABELS[rule.action_type];
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
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: '#2563EB' }}>{triggerLabel}</span>
            {rule.delay_hours > 0 && (
              <span style={{ color: '#94A3B8' }}> · después de {rule.delay_hours}h</span>
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

        {/* Toggle */}
        <button
          onClick={() => onToggle(!rule.enabled)}
          style={{
            width: 44, height: 24, borderRadius: 99, border: 'none',
            background: rule.enabled ? '#2563EB' : '#E2E8F0',
            cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2,
            left: rule.enabled ? 22 : 2,
            width: 20, height: 20, borderRadius: '50%', background: '#fff',
            transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }} />
        </button>
      </div>
    </div>
  );
}

// ─── Tarjeta de template ──────────────────────────────────────────────────────

function TemplateCard({ tmpl, onInstall }: { tmpl: AutomationTemplate; onInstall: () => void }) {
  const catMeta = CATEGORY_LABELS[tmpl.category];
  const actionMeta = ACTION_TYPE_LABELS[tmpl.action_type];

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '14px 16px',
      boxShadow: '0 2px 8px rgba(0,0,0,.05)',
      border: tmpl.installed ? '1px solid #BBF7D0' : '1px solid #F1F5F9',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: catMeta?.bg ?? '#F8FAFC',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
        }}>
          {actionMeta?.icon ?? '🤖'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 3 }}>{tmpl.name}</div>
          <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 8 }}>
            {tmpl.description ?? ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: catMeta?.bg, color: catMeta?.color }}>
              {catMeta?.label}
            </span>
            {tmpl.delay_hours > 0 && (
              <span style={{ fontSize: 10.5, color: '#94A3B8' }}>
                <Clock size={10} style={{ display: 'inline', marginRight: 3 }} />
                {tmpl.delay_hours}h
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onInstall}
          disabled={tmpl.installed}
          style={{
            border: 'none', borderRadius: 10, padding: '7px 12px', cursor: tmpl.installed ? 'not-allowed' : 'pointer',
            background: tmpl.installed ? '#F0FDF4' : '#2563EB',
            color: tmpl.installed ? '#16A34A' : '#fff',
            fontSize: 12, fontWeight: 700, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
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
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>
        Shelwi trabaja por ti
      </h2>
      <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 24px', lineHeight: 1.6 }}>
        Seguimientos automáticos, recuperación de cotizaciones perdidas y alertas inteligentes. Disponible en PRO y PREMIUM.
      </p>
      <ul style={{ margin: '0 0 28px', padding: 0, listStyle: 'none', textAlign: 'left', maxWidth: 280, marginInline: 'auto' }}>
        {['Cotización sin respuesta → seguimiento automático', 'Cliente inactivo 60 días → campaña de recuperación', 'Pedido finalizado → solicitar reseña', 'OT retrasada → alertar al supervisor', 'Cliente ve la cotización 3 veces → alerta de oportunidad'].map(b => (
          <li key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', fontSize: 13, color: '#374151' }}>
            <CheckCircle size={15} color="#22C55E" style={{ flexShrink: 0, marginTop: 1 }} />
            {b}
          </li>
        ))}
      </ul>
      <button
        onClick={() => openUpgradeModal({ title: 'Automatizaciones', message: 'Shelwi trabaja por ti mientras te dedicas a lo que importa.', targetPlan: 'pro', ctaLabel: 'Ver planes PRO' })}
        style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%', maxWidth: 300 }}
      >
        Activar automatizaciones
      </button>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AutomatizacionesPage() {
  const navigate   = useNavigate();
  const autoQ      = useAutomations();
  const installMut = useInstallTemplates();
  const toggleMut  = useToggleRule();
  const [tab, setTab] = useState<'reglas' | 'templates' | 'historial'>('reglas');

  const data = autoQ.data;

  // Sin acceso al plan
  if (autoQ.isError || (data && data.max_automations === 0)) {
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
  const activeCount = rules.filter(r => r.enabled).length;
  const uninstalledTemplates = templates.filter(t => !t.installed);

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
          {uninstalledTemplates.length > 0 && (
            <button
              onClick={() => { setTab('templates'); }}
              style={{ border: 'none', background: '#EEF2FF', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#6366F1', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Plus size={13} /> {uninstalledTemplates.length} nuevas
            </button>
          )}
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex' }}>
          {([
            { key: 'reglas',    label: `Mis reglas (${rules.length})` },
            { key: 'templates', label: 'Templates' },
            { key: 'historial', label: 'Historial' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '9px 0', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: tab === t.key ? 700 : 500,
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
        {autoQ.isLoading && (
          <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>Cargando...</div>
        )}

        {/* Tab: Reglas */}
        {tab === 'reglas' && !autoQ.isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rules.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🤖</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>Sin automatizaciones configuradas</div>
                <div style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 4 }}>Instala templates predefinidos o crea reglas personalizadas</div>
                <button onClick={() => setTab('templates')} style={{ marginTop: 14, border: 'none', background: '#2563EB', color: '#fff', borderRadius: 12, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  Ver templates
                </button>
              </div>
            ) : (
              rules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onToggle={(enabled) => {
                    if (enabled && maxAuto !== null && activeCount >= maxAuto) {
                      alert(`Límite de ${maxAuto} reglas activas alcanzado en tu plan`);
                      return;
                    }
                    toggleMut.mutate({ ruleId: rule.id, enabled });
                  }}
                />
              ))
            )}
          </div>
        )}

        {/* Tab: Templates */}
        {tab === 'templates' && !autoQ.isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, background: '#EEF2FF', borderRadius: 12, padding: '10px 14px', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: '#6366F1' }}>Templates predefinidos</span> — instálalos con un clic y actívalos cuando estés listo.
            </div>
            {templates.map(tmpl => (
              <TemplateCard
                key={tmpl.key}
                tmpl={tmpl}
                onInstall={() => installMut.mutate([tmpl.key])}
              />
            ))}
            {templates.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>Sin templates disponibles para tu plan</div>
            )}
          </div>
        )}

        {/* Tab: Historial */}
        {tab === 'historial' && !autoQ.isLoading && (
          <div>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>Sin ejecuciones todavía</div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                {logs.map((log, i) => (
                  <div key={log.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                    borderBottom: i < logs.length - 1 ? '1px solid #F1F5F9' : 'none',
                  }}>
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
      </div>
    </div>
  );
}
