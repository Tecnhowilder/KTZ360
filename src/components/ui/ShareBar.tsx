import { useState } from 'react';
import { Mail, Link2, Check } from 'lucide-react';

// ─── WhatsApp SVG oficial ─────────────────────────────────────────────────────
function WhatsAppIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

// ─── PDF SVG ─────────────────────────────────────────────────────────────────
function PdfIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
  );
}

interface Props {
  onWhatsApp: () => void | Promise<void>;
  onEmail: () => void | Promise<void>;
  onCopyLink: () => void | Promise<void>;
  onPDF: () => void | Promise<void>;
  onPrint?: () => void;
  disabled?: boolean;
}

/**
 * Barra compacta de compartición — 4 íconos centrados horizontalmente.
 * PDF e Imprimir se unificaron en un solo botón PDF.
 * Mobile-first: scroll horizontal suave sin wrap.
 */
export function ShareBar({ onWhatsApp, onEmail, onCopyLink, onPDF, disabled }: Props) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading]       = useState<string | null>(null);

  async function handle(key: string, fn: () => void | Promise<void>) {
    if (disabled || loading) return;
    setLoading(key);
    try {
      await fn();
      if (key === 'link') {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2500);
      }
    } catch { /* silencioso */ }
    finally { setLoading(null); }
  }

  const actions = [
    {
      key: 'whatsapp',
      icon: <WhatsAppIcon size={22} />,
      label: 'WhatsApp',
      activeColor: '#16A34A',
      activeBg: '#DCFCE7',
      borderColor: '#BBF7D0',
      onClick: onWhatsApp,
    },
    {
      key: 'email',
      icon: <Mail size={20} strokeWidth={1.8} />,
      label: 'Correo',
      activeColor: '#2563EB',
      activeBg: '#DBEAFE',
      borderColor: '#BFDBFE',
      onClick: onEmail,
    },
    {
      key: 'link',
      icon: linkCopied ? <Check size={20} strokeWidth={2.2} /> : <Link2 size={20} strokeWidth={1.8} />,
      label: linkCopied ? '¡Copiado!' : 'Copiar',
      activeColor: linkCopied ? '#16A34A' : '#7C3AED',
      activeBg: linkCopied ? '#DCFCE7' : '#EDE9FE',
      borderColor: linkCopied ? '#BBF7D0' : '#DDD6FE',
      onClick: onCopyLink,
    },
    {
      key: 'pdf',
      icon: <PdfIcon size={20} />,
      label: 'PDF',
      activeColor: '#DC2626',
      activeBg: '#FEE2E2',
      borderColor: '#FECACA',
      onClick: onPDF,
    },
  ];

  return (
    <div>
      {/* Título en negro */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#0F172A',
        textTransform: 'uppercase', letterSpacing: '.8px',
        marginBottom: 14, textAlign: 'center',
      }}>
        Compartir por
      </div>

      {/* Barra de íconos — centrada, scroll suave en mobile */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 2,
        paddingLeft: 4,
        paddingRight: 4,
      }}>
        {actions.map(action => {
          const isLoading  = loading === action.key;
          const isDisabled = disabled || (loading !== null && !isLoading);

          return (
            <button
              key={action.key}
              onClick={() => handle(action.key, action.onClick)}
              disabled={isDisabled}
              aria-label={action.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                flexShrink: 0,
                width: 68,
                height: 68,
                borderRadius: 18,
                border: `1.5px solid ${action.borderColor}`,
                background: isLoading ? action.activeBg : '#fff',
                color: action.activeColor,
                cursor: isDisabled ? 'default' : 'pointer',
                opacity: isDisabled && !isLoading ? 0.45 : 1,
                transition: 'all 180ms ease',
                fontFamily: 'inherit',
                padding: 0,
                boxShadow: isLoading
                  ? `0 0 0 3px ${action.activeBg}`
                  : '0 1px 3px rgba(0,0,0,.06)',
              }}
              onMouseEnter={e => {
                if (!isDisabled) {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background   = action.activeBg;
                  el.style.transform    = 'translateY(-2px)';
                  el.style.boxShadow    = `0 6px 16px rgba(0,0,0,.10)`;
                }
              }}
              onMouseLeave={e => {
                if (!isLoading) {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background   = '#fff';
                  el.style.transform    = 'none';
                  el.style.boxShadow    = '0 1px 3px rgba(0,0,0,.06)';
                }
              }}
            >
              <span style={{ lineHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isLoading ? <span style={{ fontSize: 18 }}>⋯</span> : action.icon}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.2px',
                color: action.activeColor,
                whiteSpace: 'nowrap',
              }}>
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
