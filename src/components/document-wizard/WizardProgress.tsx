import { Check } from 'lucide-react';
import type { WizardStepConfig } from '../../lib/document-engine';

interface Props {
  steps: WizardStepConfig[];
  current: number; // 1-indexed
}

/**
 * WizardProgress — barra de progreso configurable para cualquier wizard.
 * Reemplaza a QuoteProgress (que tiene los pasos hardcodeados).
 * QuoteProgress sigue existiendo sin cambios para Cotizaciones.
 */
export function WizardProgress({ steps, current }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
      {steps.map((step, idx) => {
        const num  = idx + 1;
        const done   = num < current;
        const active = num === current;
        const isLast = idx === steps.length - 1;
        const Icon   = step.icon;

        return (
          <div key={num} style={{ display: 'flex', alignItems: 'center', flex: isLast ? 0 : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#22C55E' : active ? '#2563EB' : '#F1F5F9',
                color: (done || active) ? '#fff' : '#94A3B8',
                transition: 'all .2s', flexShrink: 0,
              }}>
                {done ? <Check size={16} strokeWidth={2.5} /> : <Icon size={15} strokeWidth={1.8} />}
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: active ? 700 : 500,
                color: done ? '#22C55E' : active ? '#2563EB' : '#94A3B8',
                whiteSpace: 'nowrap',
              }}>
                {step.label}
              </span>
            </div>

            {!isLast && (
              <div style={{
                flex: 1, height: 2, margin: '0 4px', marginTop: -16,
                background: done ? '#22C55E' : '#E2E8F0',
                transition: 'background .3s', borderRadius: 99,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
