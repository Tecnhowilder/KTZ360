interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

export function ToggleSwitch({ checked, onChange, disabled = false, label, size = 'md' }: Props) {
  const W        = size === 'sm' ? 50 : 58;
  const H        = size === 'sm' ? 28 : 32;
  const knobSize = H - 4;
  const knobOff  = 2;
  const knobOn   = W - knobSize - 2;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !disabled && onChange(!checked); } }}
        style={{
          position:   'relative',
          width:      W,
          height:     H,
          borderRadius: H / 2,
          border:     'none',
          cursor:     disabled ? 'not-allowed' : 'pointer',
          background: checked ? '#22C55E' : '#CBD5E1',
          boxShadow:  checked
            ? 'inset 0 2px 4px rgba(0,100,0,0.22)'
            : 'inset 0 2px 4px rgba(0,0,0,0.14)',
          transition: 'background 250ms ease, box-shadow 250ms ease',
          outline:    'none',
          flexShrink: 0,
          padding:    0,
          opacity:    disabled ? 0.5 : 1,
        }}
      >
        {/* Perilla */}
        <span style={{
          position:     'absolute',
          top:          2,
          left:         checked ? knobOn : knobOff,
          width:        knobSize,
          height:       knobSize,
          borderRadius: '50%',
          background:   '#fff',
          boxShadow:    '0 2px 6px rgba(0,0,0,0.22), 0 1px 2px rgba(0,0,0,0.12)',
          transition:   'left 250ms ease',
          pointerEvents: 'none',
        }} />
      </button>

      {label && (
        <span style={{ fontSize: 13.5, color: '#475569', fontWeight: 500 }}>{label}</span>
      )}
    </div>
  );
}
