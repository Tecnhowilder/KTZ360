/**
 * OnboardingCard — Tarjeta de activación guiada Sprint 3.
 * Diseño: stepper horizontal con círculos conectados, fiel a la propuesta aprobada.
 * Fuente única de verdad: RPC get_onboarding_progress() — ZERO TRUST.
 */
import { useEffect, useRef } from 'react';
import { useState } from 'react';
import {
  Building2, User, Package, FileText,
  Check, ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react';

const REWARD_IMG = '/icons/box1_101952.png';
import { useNavigate } from 'react-router-dom';
import { useOnboardingProgress } from '../../hooks/useOnboardingProgress';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { logEvent } from '../../services/audit';
import { supabase } from '../../lib/supabaseClient';

// ─── Animaciones ──────────────────────────────────────────────────────────────

const STYLES = `
@keyframes ob-pulse {
  0%,100% { transform:scale(1);   box-shadow: 0 0 0 0   rgba(245,158,11,.4); }
  50%      { transform:scale(1.1); box-shadow: 0 0 0 8px rgba(245,158,11,0);  }
}
.ob-pulse { animation: ob-pulse 2s ease-in-out infinite; }
@keyframes ob-pop {
  0%   { transform: scale(.85); opacity:0; }
  100% { transform: scale(1);   opacity:1; }
}
.ob-pop { animation: ob-pop .35s cubic-bezier(.34,1.56,.64,1) both; }
`;

// ─── Constantes de color ──────────────────────────────────────────────────────

const C_DONE    = '#22C55E';   // verde completado
const C_PENDING = '#E2E8F0';   // gris pendiente
const C_REWARD  = '#F59E0B';   // ámbar recompensa
const C_BLUE    = '#2563EB';   // azul acento

// ─── RPC helpers ─────────────────────────────────────────────────────────────

async function rpcCollapsed(v: boolean) {
  await (supabase as any).rpc('set_onboarding_card_collapsed', { p_collapsed: v });
}
async function rpcHide() {
  await (supabase as any).rpc('hide_onboarding_card');
}

// ─── Step dot: círculo con ícono + badge de check ─────────────────────────────

function StepDot({
  icon, done, active, reward, rewardUnlocked, size = 48,
}: {
  icon: React.ReactNode;
  done: boolean;
  active: boolean;
  reward?: boolean;
  rewardUnlocked?: boolean;
  size?: number;
}) {
  const bg     = reward
    ? (rewardUnlocked ? '#FEF3C7' : '#F8FAFC')
    : done ? '#DCFCE7' : '#F1F5F9';
  const stroke = reward
    ? (rewardUnlocked ? C_REWARD : C_PENDING)
    : done ? C_DONE : active ? C_BLUE : C_PENDING;
  const iconColor = reward
    ? (rewardUnlocked ? C_REWARD : '#CBD5E1')
    : done ? C_DONE : active ? C_BLUE : '#94A3B8';

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}
         className={reward && !rewardUnlocked ? 'ob-pulse' : ''}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: bg,
        border:     `2px solid ${stroke}`,
        display:    'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .3s',
        overflow:   'hidden',
      }}>
        {reward
          ? (
            <img
              src={REWARD_IMG}
              alt="Recompensa"
              style={{
                width:    size * 0.72,
                height:   size * 0.72,
                objectFit: 'contain',
                opacity:  rewardUnlocked ? 1 : 0.35,
                filter:   rewardUnlocked ? 'none' : 'grayscale(0.6)',
                transition: 'opacity .3s, filter .3s',
              }}
            />
          )
          : <span style={{ color: iconColor, display: 'flex' }}>{icon}</span>
        }
      </div>
      {done && !reward && (
        <div className="ob-pop" style={{
          position:   'absolute', right: -3, bottom: -3,
          width: 18,  height: 18, borderRadius: '50%',
          background: C_DONE,
          border:     '2px solid #fff',
          display:    'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check size={10} color="#fff" strokeWidth={3} />
        </div>
      )}
      {rewardUnlocked && reward && (
        <div className="ob-pop" style={{
          position:   'absolute', right: -3, bottom: -3,
          width: 18,  height: 18, borderRadius: '50%',
          background: C_REWARD,
          border:     '2px solid #fff',
          display:    'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check size={10} color="#fff" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

// ─── Conector entre pasos ─────────────────────────────────────────────────────

function Connector({ done, dashed = false }: { done: boolean; dashed?: boolean }) {
  return (
    <div style={{
      flex:        1,
      height:      2,
      marginTop:   -2,
      background:  done ? C_DONE : 'transparent',
      borderTop:   done ? 'none' : `2px ${dashed ? 'dashed' : 'solid'} ${C_PENDING}`,
      transition:  'background .4s, border .4s',
    }} />
  );
}

// ─── Stepper horizontal ───────────────────────────────────────────────────────

interface StepDef {
  key:     'company' | 'client' | 'service' | 'quote';
  icon:    React.ReactNode;
  label:   string;
  done:    boolean;
  path:    string;
}

function HorizontalStepper({
  steps, rewardUnlocked, size = 48,
}: {
  steps: StepDef[]; rewardUnlocked: boolean; size?: number;
}) {
  const fontSize = size < 40 ? 10.5 : 11.5;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      {steps.map((s, i) => {
        const nextDone = i + 1 < steps.length ? steps[i + 1].done : rewardUnlocked;
        const isActive = !s.done && (i === 0 || steps[i - 1].done);
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
            {/* Dot + label */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <StepDot icon={s.icon} done={s.done} active={isActive} size={size} />
              <span style={{
                fontSize,
                fontWeight: s.done ? 700 : 500,
                color:      s.done ? '#22C55E' : isActive ? '#0F172A' : '#94A3B8',
                whiteSpace: 'nowrap',
                textAlign:  'center',
              }}>{s.label}</span>
            </div>
            {/* Conector */}
            {i < steps.length - 1 && (
              <div style={{ flex: 1, paddingBottom: 24 }}>
                <Connector done={s.done && nextDone} dashed={!s.done} />
              </div>
            )}
          </div>
        );
      })}

      {/* Conector → Recompensa */}
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <div style={{ flex: 1, paddingBottom: 24 }}>
          <Connector done={rewardUnlocked} dashed={!steps[steps.length - 1].done} />
        </div>
        {/* Recompensa dot */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <StepDot
            icon={null}
            done={false}
            active={false}
            reward
            rewardUnlocked={rewardUnlocked}
            size={size}
          />
          <span style={{
            fontSize,
            fontWeight: rewardUnlocked ? 700 : 500,
            color:      rewardUnlocked ? C_REWARD : '#CBD5E1',
            whiteSpace: 'nowrap',
          }}>Recompensa</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta expandida ────────────────────────────────────────────────────────

function ExpandedView({
  steps, progress, rewardUnlocked,
  onCollapse, onHide, navigate, openQuoteFlow, company, logEv,
}: {
  steps: StepDef[]; progress: number; rewardUnlocked: boolean;
  onCollapse: () => void; onHide: () => void;
  navigate: (p: string) => void; openQuoteFlow: (c: any) => void;
  company: any; logEv: (a: string) => void;
}) {
  const nextStep = steps.find(s => !s.done);

  function handleCta() {
    if (rewardUnlocked) {
      logEv('reward_cta_clicked');
      navigate('/app/plantillas');
      return;
    }
    if (!nextStep) return;
    logEv(`step_cta_${nextStep.key}`);
    if (nextStep.key === 'quote') openQuoteFlow({ cfg: defaultQConfig(company) });
    else navigate(nextStep.path);
  }

  return (
    <div style={{ padding: '18px 20px 16px' }}>
      {/* Header: título + % + colapsar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            {rewardUnlocked
              ? <img src={REWARD_IMG} alt="Recompensa" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              : <span style={{ fontSize: 20 }}>🚀</span>
            }
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', lineHeight: 1.25 }}>
              {rewardUnlocked ? '¡Plantilla Premium desbloqueada!' : 'Configura tu negocio\nen menos de 3 minutos'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: C_BLUE, lineHeight: 1 }}>{progress}%</div>
            <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 600 }}>Completado</div>
          </div>
          <button
            onClick={onCollapse}
            style={{ border: 'none', background: '#F8FAFC', cursor: 'pointer', borderRadius: 8, padding: 6, color: '#94A3B8', display: 'flex' }}
            aria-label="Contraer"
          >
            <ChevronUp size={16} />
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div style={{ marginBottom: 20 }}>
        <HorizontalStepper steps={steps} rewardUnlocked={rewardUnlocked} size={48} />
      </div>

      {/* Footer: CTA + ver todos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleCta}
          style={{
            border:       'none', cursor: 'pointer',
            background:   rewardUnlocked ? C_REWARD : C_BLUE,
            color:        '#fff', fontWeight: 700, fontSize: 13.5,
            padding:      '11px 20px', borderRadius: 11,
            display:      'flex', alignItems: 'center', gap: 6,
            transition:   'opacity .15s', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '.88')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          {rewardUnlocked
            ? <><img src={REWARD_IMG} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} /> Usar plantilla</>
            : 'Continuar'
          }
          {!rewardUnlocked && <ArrowRight size={14} />}
        </button>

        {rewardUnlocked ? (
          <button onClick={onHide} style={{ border: 'none', background: 'none', color: '#94A3B8', fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
            Ocultar tarjeta
          </button>
        ) : (
          <button
            onClick={() => { logEv('see_all_steps'); navigate('/app/empresa'); }}
            style={{ border: 'none', background: 'none', color: C_BLUE, fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Ver todos los pasos <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta contraída ────────────────────────────────────────────────────────

function CollapsedView({
  steps, rewardUnlocked, onExpand,
}: {
  steps: StepDef[]; rewardUnlocked: boolean; onExpand: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      aria-label="Expandir guía de activación"
      style={{
        width: '100%', border: 'none', background: 'none', cursor: 'pointer',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      {/* Mini stepper */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <HorizontalStepper steps={steps} rewardUnlocked={rewardUnlocked} size={34} />
      </div>
      {/* Chevron expand */}
      <ChevronDown size={18} color="#94A3B8" style={{ flexShrink: 0 }} />
    </button>
  );
}

// ─── OnboardingCard (export) ──────────────────────────────────────────────────

export function OnboardingCard({ margin = '0 16px' }: { margin?: string }) {
  const { data, refetch }          = useOnboardingProgress();
  const { company, profile }       = useWorkspace();
  const { openQuoteFlow }          = useUI();
  const navigate                   = useNavigate();
  const [collapsed, setCollapsed]  = useState(false);
  const prevProgress               = useRef<number | null>(null);
  const syncedCollapsed            = useRef(false);

  // Sincronizar collapsed desde DB (solo la primera vez)
  useEffect(() => {
    if (data && !syncedCollapsed.current) {
      setCollapsed(data.card_collapsed);
      syncedCollapsed.current = true;
    }
  }, [data]);

  // Analítica: detectar pasos completados
  useEffect(() => {
    if (!data) return;
    const prev = prevProgress.current;
    prevProgress.current = data.progress;
    if (prev === null || data.progress <= prev) return;
    if (data.company_completed  && prev < 25)  logEv('step_company_completed');
    if (data.client_completed   && prev < 50)  logEv('step_client_completed');
    if (data.service_completed  && prev < 75)  logEv('step_service_completed');
    if (data.quote_completed    && prev < 100) logEv('step_quote_completed');
    if (data.reward_unlocked)                   logEv('reward_unlocked');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.progress]);

  function logEv(action: string) {
    logEvent(profile.workspace_id, profile.id, action).catch(() => {});
  }

  async function handleCollapse() {
    setCollapsed(true);
    logEv('guide_collapsed');
    await rpcCollapsed(true);
  }
  async function handleExpand() {
    setCollapsed(false);
    logEv('guide_expanded');
    await rpcCollapsed(false);
  }
  async function handleHide() {
    logEv('guide_dismissed');
    await rpcHide();
    refetch();
  }

  if (!data || data.card_hidden) return null;

  const steps: StepDef[] = [
    { key: 'company', icon: <Building2 size={20} />, label: 'Empresa',    done: data.company_completed, path: '/app/empresa'    },
    { key: 'client',  icon: <User       size={20} />, label: 'Cliente',    done: data.client_completed,  path: '/app/clientes'   },
    { key: 'service', icon: <Package    size={20} />, label: 'Servicio',   done: data.service_completed, path: '/app/materiales' },
    { key: 'quote',   icon: <FileText   size={20} />, label: 'Cotización', done: data.quote_completed,   path: '/app/cotizaciones' },
  ];

  return (
    <>
      <style>{STYLES}</style>
      <div style={{
        margin,
        background:   '#fff',
        borderRadius: 16,
        border:       '1px solid #E2E8F0',
        boxShadow:    '0 2px 8px rgba(0,0,0,.07)',
        overflow:     'hidden',
      }}>
        {collapsed
          ? <CollapsedView steps={steps} rewardUnlocked={data.reward_unlocked} onExpand={handleExpand} />
          : <ExpandedView
              steps={steps} progress={data.progress} rewardUnlocked={data.reward_unlocked}
              onCollapse={handleCollapse} onHide={handleHide}
              navigate={navigate} openQuoteFlow={openQuoteFlow}
              company={company} logEv={logEv}
            />
        }
      </div>
    </>
  );
}
