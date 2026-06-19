interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

/**
 * Toggle switch accesible con texto ON/OFF, perilla animada 300ms ease.
 * Tamaños: sm = 60×30px, md = 72×36px (mobile-first).
 */
export function ToggleSwitch({ checked, onChange, disabled = false, label, size = 'md' }: Props) {
  const W = size === 'sm' ? 60 : 72;
  const H = size === 'sm' ? 30 : 36;
  const knobSize = H - 8;        // 22 o 28
  const knobOff  = 4;
  const knobOn   = W - knobSize - 4;

  function handleClick() {
    if (!disabled) onChange(!checked);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          width: W,
          height: H,
          borderRadius: H / 2,
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: checked ? '#22C55E' : '#D1D5DB',
          transition: 'background 300ms ease',
          outline: 'none',
          flexShrink: 0,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Texto ON / OFF */}
        <span style={{
          position: 'absolute',
          left: checked ? 8 : 'auto',
          right: checked ? 'auto' : 8,
          fontSize: size === 'sm' ? 9 : 10,
          fontWeight: 800,
          color: checked ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.7)',
          letterSpacing: '.5px',
          pointerEvents: 'none',
          userSelect: 'none',
          lineHeight: `${H}px`,
          transition: 'all 300ms ease',
        }}>
          {checked ? 'ON' : 'OFF'}
        </span>

        {/* Perilla */}
        <span style={{
          position: 'absolute',
          top: 4,
          left: checked ? knobOn : knobOff,
          width: knobSize,
          height: knobSize,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          transition: 'left 300ms ease',
          pointerEvents: 'none',
        }} />
      </button>

      {label && (
        <span style={{ fontSize: 13.5, color: '#475569', fontWeight: 500 }}>{label}</span>
      )}
    </div>
  );
}
