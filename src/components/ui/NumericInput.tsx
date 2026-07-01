import { useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  suffix?: string;
  prefix?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  currency?: boolean; // activa formato de miles (ej. $50.000)
}

// Formato colombiano: puntos para miles (50000 → "50.000")
function fmtThousands(n: number): string {
  if (n === 0) return '';
  return Math.round(n).toLocaleString('es-CO');
}

// Parsear número desde string con o sin formato colombiano ("50.000" → 50000)
function parseLocale(raw: string): number {
  // Quitar puntos de miles, reemplazar coma decimal por punto
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned);
}

export function NumericInput({
  value, onChange, min = 0, max,
  placeholder = '0', suffix, prefix, style, disabled,
  currency = false,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw]         = useState('');

  const isCurrency = currency || prefix === '$';

  function handleFocus() {
    setFocused(true);
    // Al enfocar mostramos número plano sin formato para fácil edición
    setRaw(value === 0 ? '' : String(value));
  }

  function handleBlur() {
    setFocused(false);
    const parsed = isCurrency ? parseLocale(raw) : parseFloat(raw.replace(',', '.'));
    if (!isNaN(parsed)) {
      const clamped = max !== undefined ? Math.min(max, Math.max(min, parsed)) : Math.max(min, parsed);
      onChange(clamped);
    } else {
      onChange(min);
    }
    setRaw('');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (/^-?\d*[.,]?\d*$/.test(val) || val === '') {
      setRaw(val);
    }
  }

  // Mostrar con miles cuando no está enfocado y es campo de dinero
  const displayValue = focused
    ? raw
    : value === 0
      ? ''
      : isCurrency
        ? fmtThousands(value)
        : String(value);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '100%' }}>
      {prefix && (
        <span style={{
          position: 'absolute', left: 12, fontSize: 14, color: '#64748B',
          pointerEvents: 'none', userSelect: 'none',
        }}>{prefix}</span>
      )}
      <input
        type="text"
        inputMode={isCurrency ? 'numeric' : 'decimal'}
        value={displayValue}
        placeholder={placeholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        disabled={disabled}
        style={{
          width: '100%',
          height: 44,
          border: '1px solid #E2E8F0',
          borderRadius: 10,
          padding: `0 ${suffix ? '36px' : '12px'} 0 ${prefix ? '28px' : '12px'}`,
          fontSize: 14,
          fontVariantNumeric: 'tabular-nums',
          outline: 'none',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          background: disabled ? '#F8FAFC' : '#fff',
          color: '#0F172A',
          transition: 'border-color .15s',
          ...(style ?? {}),
        }}
      />
      {suffix && (
        <span style={{
          position: 'absolute', right: 12, fontSize: 13, color: '#94A3B8',
          pointerEvents: 'none', userSelect: 'none',
        }}>{suffix}</span>
      )}
    </div>
  );
}
