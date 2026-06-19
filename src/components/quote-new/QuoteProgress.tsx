import { Check, User, Package, DollarSign, Eye } from 'lucide-react';

const STEPS = [
  { icon: User,         label: 'Cliente' },
  { icon: Package,      label: 'Ítems' },
  { icon: DollarSign,   label: 'Costos' },
  { icon: Eye,          label: 'Vista previa' },
];

interface Props {
  current: number; // 1-indexed
}

export function QuoteProgress({ current }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
      {STEPS.map((step, idx) => {
        const num = idx + 1;
        const done = num < current;
        const active = num === current;
        const isLast = idx === STEPS.length - 1;

        return (
          <div key={num} style={{ display: 'flex', alignItems: 'center', flex: isLast ? 0 : 1 }}>
            {/* Circle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#22C55E' : active ? '#2563EB' : '#F1F5F9',
                color: done || active ? '#fff' : '#94A3B8',
                transition: 'all .2s',
                flexShrink: 0,
              }}>
                {done ? <Check size={16} strokeWidth={2.5} /> : <step.icon size={15} strokeWidth={1.8} />}
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: active ? 700 : 500,
                color: done ? '#22C55E' : active ? '#2563EB' : '#94A3B8',
                whiteSpace: 'nowrap',
              }}>
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {!isLast && (
              <div style={{
                flex: 1, height: 2, margin: '0 4px', marginTop: -16,
                background: done ? '#22C55E' : '#E2E8F0',
                transition: 'background .3s',
                borderRadius: 99,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
