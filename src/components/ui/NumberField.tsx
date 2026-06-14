import { useEffect, useState } from 'react';

interface NumberFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/** Input numérico que permite borrar por completo el campo (incluyendo un "0" por defecto) mientras se escribe. */
export function NumberField({ value, onChange, min, max, onBlur, ...rest }: NumberFieldProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    const parsed = parseFloat(text);
    if (text === '' || isNaN(parsed) || parsed !== value) {
      setText(String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        if (v === '' || v === '-') return;
        let n = parseFloat(v);
        if (isNaN(n)) return;
        if (min != null) n = Math.max(min, n);
        if (max != null) n = Math.min(max, n);
        onChange(n);
      }}
      onBlur={(e) => {
        if (text === '' || text === '-' || isNaN(parseFloat(text))) {
          const fallback = min != null ? min : 0;
          setText(String(fallback));
          onChange(fallback);
        }
        onBlur?.(e);
      }}
    />
  );
}
