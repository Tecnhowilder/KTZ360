/**
 * PhoneInput — Selector de país + teléfono.
 * Hotfix WhatsApp: separa country_code de phone_number.
 * Default: 🇨🇴 +57 Colombia.
 * Mobile-first. Sin librerías pesadas para el core.
 */
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface PhoneValue {
  countryCode: string;  // '+57'
  phone:       string;  // '3154823475'
}

interface Country {
  code: string;    // '+57'
  iso:  string;    // 'CO'
  name: string;    // 'Colombia'
  flag: string;    // '🇨🇴'
}

// Lista de países más usados (expandible)
export const COUNTRIES: Country[] = [
  { code: '+57',  iso: 'CO', name: 'Colombia',          flag: '🇨🇴' },
  { code: '+1',   iso: 'US', name: 'Estados Unidos',    flag: '🇺🇸' },
  { code: '+52',  iso: 'MX', name: 'México',             flag: '🇲🇽' },
  { code: '+54',  iso: 'AR', name: 'Argentina',          flag: '🇦🇷' },
  { code: '+55',  iso: 'BR', name: 'Brasil',             flag: '🇧🇷' },
  { code: '+56',  iso: 'CL', name: 'Chile',              flag: '🇨🇱' },
  { code: '+51',  iso: 'PE', name: 'Perú',               flag: '🇵🇪' },
  { code: '+58',  iso: 'VE', name: 'Venezuela',          flag: '🇻🇪' },
  { code: '+593', iso: 'EC', name: 'Ecuador',            flag: '🇪🇨' },
  { code: '+591', iso: 'BO', name: 'Bolivia',            flag: '🇧🇴' },
  { code: '+595', iso: 'PY', name: 'Paraguay',           flag: '🇵🇾' },
  { code: '+598', iso: 'UY', name: 'Uruguay',            flag: '🇺🇾' },
  { code: '+34',  iso: 'ES', name: 'España',             flag: '🇪🇸' },
  { code: '+1',   iso: 'CA', name: 'Canadá',             flag: '🇨🇦' },
  { code: '+44',  iso: 'GB', name: 'Reino Unido',        flag: '🇬🇧' },
  { code: '+49',  iso: 'DE', name: 'Alemania',           flag: '🇩🇪' },
  { code: '+33',  iso: 'FR', name: 'Francia',            flag: '🇫🇷' },
  { code: '+39',  iso: 'IT', name: 'Italia',             flag: '🇮🇹' },
  { code: '+31',  iso: 'NL', name: 'Países Bajos',       flag: '🇳🇱' },
  { code: '+351', iso: 'PT', name: 'Portugal',           flag: '🇵🇹' },
  { code: '+507', iso: 'PA', name: 'Panamá',             flag: '🇵🇦' },
  { code: '+506', iso: 'CR', name: 'Costa Rica',         flag: '🇨🇷' },
  { code: '+503', iso: 'SV', name: 'El Salvador',        flag: '🇸🇻' },
  { code: '+502', iso: 'GT', name: 'Guatemala',          flag: '🇬🇹' },
  { code: '+504', iso: 'HN', name: 'Honduras',           flag: '🇭🇳' },
  { code: '+505', iso: 'NI', name: 'Nicaragua',          flag: '🇳🇮' },
  { code: '+53',  iso: 'CU', name: 'Cuba',               flag: '🇨🇺' },
  { code: '+1809',iso: 'DO', name: 'Rep. Dominicana',    flag: '🇩🇴' },
];

/**
 * Construye la URL de WhatsApp correcta.
 * Siempre usar esta función — nunca construir la URL en el componente.
 */
export function buildWhatsAppUrl(countryCode: string, phone: string, message?: string): string {
  const cc    = countryCode.replace(/[^0-9]/g, '') || '57';
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length < 7) return 'https://wa.me/';
  const base  = `https://wa.me/${cc}${clean}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

interface PhoneInputProps {
  value:    PhoneValue;
  onChange: (v: PhoneValue) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function PhoneInput({ value, onChange, placeholder = '300 000 0000', disabled, style }: PhoneInputProps) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState('');
  const dropRef               = useRef<HTMLDivElement>(null);
  const searchRef             = useRef<HTMLInputElement>(null);

  const selected = COUNTRIES.find(c => c.code === value.countryCode && (c.iso !== 'CA' || value.countryCode !== '+1'))
    ?? COUNTRIES[0];

  const filtered = search
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search) ||
        c.iso.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, [open]);

  return (
    <div style={{ display: 'flex', gap: 6, ...style }}>
      {/* Selector de país */}
      <div ref={dropRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => !disabled && setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            height: 42, padding: '0 10px', borderRadius: 10,
            border: '1.5px solid #E2E8F0', background: disabled ? '#F8FAFC' : '#fff',
            cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}>
          <span style={{ fontSize: 18 }}>{selected.flag}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{selected.code}</span>
          <ChevronDown size={13} color="#94A3B8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '.15s' }} />
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 200,
            background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
            boxShadow: '0 8px 30px rgba(0,0,0,.12)', width: 240, marginTop: 4,
            maxHeight: 280, display: 'flex', flexDirection: 'column',
          }}>
            {/* Búsqueda */}
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F8FAFC', borderRadius: 8, padding: '6px 10px' }}>
                <Search size={13} color="#94A3B8" />
                <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar país..."
                  style={{ border: 'none', background: 'none', fontSize: 13, outline: 'none', width: '100%', color: '#0F172A' }} />
              </div>
            </div>
            {/* Lista */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filtered.map(c => (
                <button key={c.iso} type="button"
                  onClick={() => { onChange({ ...value, countryCode: c.code }); setOpen(false); setSearch(''); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', border: 'none', background: value.countryCode === c.code ? '#EFF6FF' : '#fff',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{c.flag}</span>
                  <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>{c.code}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>Sin resultados</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input de teléfono */}
      <input
        type="tel"
        value={value.phone}
        onChange={e => onChange({ ...value, phone: e.target.value })}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1, height: 42, padding: '0 12px', borderRadius: 10,
          border: '1.5px solid #E2E8F0', fontSize: 14, outline: 'none',
          background: disabled ? '#F8FAFC' : '#fff', color: '#0F172A',
          minWidth: 0,
        }}
      />
    </div>
  );
}
