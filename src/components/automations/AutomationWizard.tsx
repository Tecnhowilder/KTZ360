/**
 * AutomationWizard — Wizard No-Code de 4 pasos para crear reglas.
 * Paso 1: Elegir trigger
 * Paso 2: Condiciones (opcionales)
 * Paso 3: Acción
 * Paso 4: Resumen + activar
 *
 * Mobile-first. Funciona igual en desktop.
 */
import { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, Zap } from 'lucide-react';
import { useCreateRule } from '../../hooks/useAutomations';
import {
  TRIGGER_EVENT_LABELS, ACTION_TYPE_LABELS,
  type AutomationCondition,
} from '../../services/automations';

// ─── Datos del wizard ─────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { key: 'quote_sent',           label: 'Cotización enviada',          icon: '📤', category: 'CRM' },
  { key: 'quote_approved',       label: 'Cotización aprobada',         icon: '✅', category: 'CRM' },
  { key: 'quote_rejected',       label: 'Cotización rechazada',        icon: '❌', category: 'CRM' },
  { key: 'quote_viewed_multiple',label: 'Cotización vista varias veces',icon: '👁', category: 'CRM' },
  { key: 'order_created',        label: 'Pedido creado',               icon: '📦', category: 'Operaciones' },
  { key: 'order_completed',      label: 'Pedido finalizado',           icon: '🏁', category: 'Operaciones' },
  { key: 'work_order_created',   label: 'OT creada',                   icon: '🔧', category: 'Operaciones' },
  { key: 'work_order_assigned',  label: 'OT asignada',                 icon: '👤', category: 'Operaciones' },
  { key: 'work_order_completed', label: 'OT finalizada',               icon: '✔️', category: 'Operaciones' },
  { key: 'client_created',       label: 'Cliente creado',              icon: '🆕', category: 'Retención' },
  { key: 'client_inactive',      label: 'Cliente inactivo (60d)',       icon: '💤', category: 'Retención' },
  { key: 'work_order_delayed',   label: 'OT retrasada (24h)',           icon: '⏰', category: 'Operaciones' },
];

const CONDITION_FIELDS: Record<string, Array<{ key: string; label: string; operators: string[]; type: 'number' | 'select'; options?: { value: string; label: string }[] }>> = {
  quote_sent: [
    { key: 'delay_hours', label: 'Esperar antes de ejecutar', operators: [], type: 'number' },
    { key: 'commercial_status', label: 'Estado CRM no sea', operators: ['not_in'], type: 'select',
      options: [{ value: 'vista', label: 'Vista' },{ value: 'negociacion', label: 'Negociación' },{ value: 'aprobada', label: 'Aprobada' }] },
  ],
  quote_viewed_multiple: [
    { key: 'view_count', label: 'Número de aperturas mínimo', operators: ['gte'], type: 'number' },
  ],
  client_inactive: [
    { key: 'days_inactive', label: 'Días sin actividad mínimo', operators: ['gte'], type: 'number' },
  ],
  work_order_delayed: [
    { key: 'hours_overdue', label: 'Horas de retraso mínimo', operators: ['gte'], type: 'number' },
  ],
};

const ACTION_OPTIONS = [
  { key: 'create_followup_and_notify', label: 'Crear seguimiento y notificar', icon: '📞', description: 'Crea un seguimiento en CRM y notifica al asesor' },
  { key: 'notify_user',               label: 'Notificar al asesor',          icon: '🔔', description: 'Envía una notificación interna al equipo' },
  { key: 'notify_supervisor',         label: 'Notificar al supervisor',       icon: '⚠️', description: 'Alerta específica para supervisores' },
  { key: 'send_whatsapp',            label: 'Enviar WhatsApp',               icon: '💬', description: 'Mensaje automático al cliente por WhatsApp' },
  { key: 'send_email',               label: 'Enviar correo',                 icon: '✉️', description: 'Email al cliente desde Gmail o Outlook' },
  { key: 'change_commercial_status', label: 'Cambiar estado comercial',       icon: '🔄', description: 'Actualiza el estado CRM de la cotización' },
];

interface WizardState {
  trigger:     string;
  delayHours:  number;
  conditions:  AutomationCondition[];
  action:      string;
  actionPayload: Record<string, unknown>;
  name:        string;
}

const DEFAULT: WizardState = {
  trigger: '', delayHours: 0, conditions: [],
  action: '', actionPayload: {}, name: '',
};

// ─── Componentes internos ─────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 0 16px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: i < total - 1 ? 1 : 'none',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: i < current ? '#2563EB' : i === current ? '#2563EB' : '#F1F5F9',
            color: i <= current ? '#fff' : '#94A3B8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700,
          }}>
            {i < current ? <Check size={14} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? '#2563EB' : '#F1F5F9', borderRadius: 1 }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Paso 1: Trigger ──────────────────────────────────────────────────────────

function Step1Trigger({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const categories = [...new Set(TRIGGER_OPTIONS.map(t => t.category))];
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>¿Cuándo se activa?</div>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>Elige el evento que dispara esta automatización</div>
      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>{cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TRIGGER_OPTIONS.filter(t => t.category === cat).map(t => (
              <button
                key={t.key}
                onClick={() => onChange(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderRadius: 12, border: value === t.key ? '2px solid #2563EB' : '2px solid #F1F5F9',
                  background: value === t.key ? '#EFF6FF' : '#fff', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{t.icon}</span>
                <span style={{ fontSize: 14, fontWeight: value === t.key ? 700 : 500, color: value === t.key ? '#2563EB' : '#374151' }}>
                  {t.label}
                </span>
                {value === t.key && <Check size={16} color="#2563EB" style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Paso 2: Condiciones ──────────────────────────────────────────────────────

function Step2Conditions({
  trigger, delayHours, conditions, onDelay, onConditions,
}: {
  trigger: string; delayHours: number; conditions: AutomationCondition[];
  onDelay: (h: number) => void; onConditions: (c: AutomationCondition[]) => void;
}) {
  const fields = CONDITION_FIELDS[trigger] ?? [];

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Condiciones</div>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>Opcional — refina cuándo se ejecuta la acción</div>

      {/* Delay */}
      <div style={{ background: '#F8FAFC', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
          ⏱ Esperar antes de ejecutar
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="number" min={0} max={720} value={delayHours}
            onChange={e => onDelay(parseInt(e.target.value) || 0)}
            style={{ width: 80, padding: '8px 10px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 14, textAlign: 'center', outline: 'none' }}
          />
          <span style={{ fontSize: 13.5, color: '#64748B' }}>horas (0 = inmediato)</span>
        </div>
        {delayHours > 0 && (
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 6, fontWeight: 600 }}>
            Se ejecutará {delayHours >= 24 ? `en ${Math.floor(delayHours/24)} día(s)` : `después de ${delayHours} hora(s)`}
          </div>
        )}
      </div>

      {/* Campos de condición específicos al trigger */}
      {fields.filter(f => f.key !== 'delay_hours').map(f => (
        <div key={f.key} style={{ background: '#F8FAFC', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>{f.label}</div>
          {f.type === 'number' ? (
            <input
              type="number" min={1}
              value={(conditions.find(c => c.field === f.key)?.value as number) ?? ''}
              onChange={e => {
                const val = parseInt(e.target.value) || null;
                const newConds = conditions.filter(c => c.field !== f.key);
                if (val) newConds.push({ field: f.key, operator: f.operators[0] as AutomationCondition['operator'] ?? 'gte', value: val });
                onConditions(newConds);
              }}
              placeholder="Ingresa un valor"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
            />
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {f.options?.map(opt => {
                const cond = conditions.find(c => c.field === f.key);
                const selected = Array.isArray(cond?.value) && (cond!.value as string[]).includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      const cur = conditions.find(c => c.field === f.key);
                      const curVals: string[] = Array.isArray(cur?.value) ? (cur!.value as string[]) : [];
                      const newVals = selected ? curVals.filter(v => v !== opt.value) : [...curVals, opt.value];
                      const newConds = conditions.filter(c => c.field !== f.key);
                      if (newVals.length) newConds.push({ field: f.key, operator: 'not_in', value: newVals });
                      onConditions(newConds);
                    }}
                    style={{
                      padding: '7px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
                      background: selected ? '#2563EB' : '#E2E8F0',
                      color: selected ? '#fff' : '#374151', fontSize: 12.5, fontWeight: 600,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {fields.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: 13.5 }}>
          Sin condiciones adicionales para este trigger. La acción se ejecutará siempre que ocurra el evento.
        </div>
      )}
    </div>
  );
}

// ─── Paso 3: Acción ───────────────────────────────────────────────────────────

function Step3Action({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>¿Qué hace Shelwi?</div>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>Elige la acción que se ejecutará automáticamente</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ACTION_OPTIONS.map(a => (
          <button
            key={a.key}
            onClick={() => onChange(a.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
              borderRadius: 14, border: value === a.key ? '2px solid #2563EB' : '2px solid #F1F5F9',
              background: value === a.key ? '#EFF6FF' : '#fff', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>{a.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: value === a.key ? 700 : 600, color: value === a.key ? '#2563EB' : '#0F172A' }}>
                {a.label}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{a.description}</div>
            </div>
            {value === a.key && <Check size={16} color="#2563EB" style={{ flexShrink: 0 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Paso 4: Resumen ──────────────────────────────────────────────────────────

function Step4Summary({
  state, onNameChange,
}: { state: WizardState; onNameChange: (n: string) => void }) {
  const triggerOpt  = TRIGGER_OPTIONS.find(t => t.key === state.trigger);
  const actionOpt   = ACTION_OPTIONS.find(a => a.key === state.action);

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Resumen</div>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>Revisa y ponle nombre a tu automatización</div>

      {/* Nombre */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 6 }}>NOMBRE DE LA REGLA</div>
        <input
          type="text" value={state.name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Ej: Seguimiento 72h post-envío"
          style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      {/* Flujo visual */}
      <div style={{ background: '#F8FAFC', borderRadius: 16, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SummaryBlock
          label="CUANDO" icon={triggerOpt?.icon ?? '⚡'}
          text={triggerOpt?.label ?? state.trigger}
          color="#2563EB" bg="#EFF6FF"
        />
        {state.delayHours > 0 && (
          <SummaryBlock
            label="ESPERAR" icon="⏱"
            text={state.delayHours >= 24 ? `${Math.floor(state.delayHours/24)} día(s)` : `${state.delayHours} hora(s)`}
            color="#D97706" bg="#FFFBEB"
          />
        )}
        {state.conditions.length > 0 && (
          <SummaryBlock
            label="Y SI" icon="✔️"
            text={`${state.conditions.length} condición(es) se cumplen`}
            color="#7C3AED" bg="#F5F3FF"
          />
        )}
        <SummaryBlock
          label="ENTONCES" icon={actionOpt?.icon ?? '🤖'}
          text={actionOpt?.label ?? state.action}
          color="#16A34A" bg="#F0FDF4"
        />
      </div>
    </div>
  );
}

function SummaryBlock({ label, icon, text, color, bg }: {
  label: string; icon: string; text: string; color: string; bg: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 9, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: .6 }}>{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{text}</div>
      </div>
    </div>
  );
}

// ─── Wizard principal ─────────────────────────────────────────────────────────

const STEP_LABELS = ['Trigger', 'Condiciones', 'Acción', 'Resumen'];

interface Props {
  onClose:   () => void;
  onSuccess: () => void;
}

export function AutomationWizard({ onClose, onSuccess }: Props) {
  const [step,  setStep]  = useState(0);
  const [state, setState] = useState<WizardState>(DEFAULT);
  const createMut = useCreateRule();

  function update(patch: Partial<WizardState>) {
    setState(prev => ({ ...prev, ...patch }));
  }

  const canNext = () => {
    if (step === 0) return !!state.trigger;
    if (step === 2) return !!state.action;
    if (step === 3) return state.name.trim().length >= 3;
    return true;
  };

  async function handleFinish() {
    try {
      await createMut.mutateAsync({
        name:          state.name.trim(),
        triggerEvent:  state.trigger,
        actionType:    state.action,
        delayHours:    state.delayHours,
        conditions:    state.conditions,
        actionPayload: state.actionPayload,
        description:   `Regla creada con wizard: ${TRIGGER_EVENT_LABELS[state.trigger] ?? state.trigger} → ${ACTION_TYPE_LABELS[state.action]?.label ?? state.action}`,
      });
      onSuccess();
    } catch { /* showToast handled in hook */ }
  }

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.5)' }} />

      {/* Panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 65,
        background: '#fff', borderRadius: '20px 20px 0 0',
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
      }}>
        {/* Handle + header */}
        <div style={{ padding: '12px 20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={18} color="#6366F1" />
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Nueva automatización</span>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#64748B' }}>✕</button>
          </div>
          <StepIndicator current={step} total={4} />
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 12 }}>
            Paso {step + 1} — {STEP_LABELS[step]}
          </div>
        </div>

        {/* Contenido scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {step === 0 && <Step1Trigger value={state.trigger} onChange={v => update({ trigger: v })} />}
          {step === 1 && (
            <Step2Conditions
              trigger={state.trigger} delayHours={state.delayHours} conditions={state.conditions}
              onDelay={h => update({ delayHours: h })}
              onConditions={c => update({ conditions: c })}
            />
          )}
          {step === 2 && <Step3Action value={state.action} onChange={v => update({ action: v })} />}
          {step === 3 && <Step4Summary state={state} onNameChange={n => update({ name: n })} />}
        </div>

        {/* Botones de navegación */}
        <div style={{ padding: '14px 20px calc(14px + env(safe-area-inset-bottom))', display: 'flex', gap: 10 }}>
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)} style={{ padding: '13px 20px', borderRadius: 14, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChevronLeft size={16} /> Anterior
            </button>
          ) : (
            <button onClick={onClose} style={{ padding: '13px 20px', borderRadius: 14, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#374151' }}>
              Cancelar
            </button>
          )}
          <button
            disabled={!canNext() || createMut.isPending}
            onClick={() => step < 3 ? setStep(s => s + 1) : handleFinish()}
            style={{
              flex: 1, padding: '13px 0', borderRadius: 14, border: 'none',
              background: !canNext() ? '#E2E8F0' : step < 3 ? '#0F172A' : '#16A34A',
              color: !canNext() ? '#94A3B8' : '#fff',
              cursor: !canNext() ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {createMut.isPending ? 'Creando...' : step < 3 ? <><span>Continuar</span><ChevronRight size={16} /></> : <><Check size={16} /> Crear automatización</>}
          </button>
        </div>
      </div>
    </>
  );
}
