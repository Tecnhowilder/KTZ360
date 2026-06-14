interface QuotationStepperProps {
  currentStep: number; // 0-based
  labels: string[];
}

export function QuotationStepper({ currentStep, labels }: QuotationStepperProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
      {labels.map((label, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        const filled = done || active;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flex: i === labels.length - 1 ? '0 0 auto' : '1 1 auto', minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  background: filled ? '#2563EB' : '#F1F5F9',
                  color: filled ? '#fff' : '#94A3B8',
                  transition: 'all .2s ease',
                }}
              >
                {done ? '✓' : i + 1}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11.5,
                  fontWeight: active ? 700 : 600,
                  color: active ? '#2563EB' : '#94A3B8',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
              >
                {label}
              </div>
            </div>
            {i < labels.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  margin: '15px 6px 0',
                  borderRadius: 99,
                  background: i < currentStep ? '#2563EB' : '#E2E8F0',
                  minWidth: 16,
                  transition: 'background .2s ease',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
