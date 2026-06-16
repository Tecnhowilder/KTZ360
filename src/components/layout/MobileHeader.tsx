import { Bell, Menu } from 'lucide-react';
import { APP_NAME } from '../../lib/brand';

interface MobileHeaderProps {
  onMenuOpen: () => void;
}

export function MobileHeader({ onMenuOpen }: MobileHeaderProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 35,
        background: 'rgba(255,255,255,.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #EEF2F7',
        padding: '0 16px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {/* Hamburger */}
      <button
        onClick={onMenuOpen}
        aria-label="Abrir menú"
        style={{
          border: 'none', background: 'none', padding: 0,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 44, height: 44, color: '#0F172A', flexShrink: 0,
        }}
      >
        <Menu size={22} strokeWidth={2} />
      </button>

      {/* Logo centered */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/icons/logo-light.png" alt="KTZ360" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.5px', color: '#0F172A' }}>{APP_NAME}</span>
      </div>

      {/* Bell */}
      <button
        aria-label="Notificaciones"
        style={{
          border: 'none', background: 'none', padding: 0,
          cursor: 'pointer', width: 44, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#64748B', flexShrink: 0,
        }}
      >
        <Bell size={20} />
      </button>
    </header>
  );
}
