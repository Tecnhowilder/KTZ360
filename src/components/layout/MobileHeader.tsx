import { Menu } from 'lucide-react';
import { NotificationBell } from '../ui/NotificationBell';

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
        background: '#0B0F19',
        borderBottom: '1px solid rgba(255,255,255,.08)',
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
          width: 44, height: 44, color: 'rgba(255,255,255,.75)', flexShrink: 0,
        }}
      >
        <Menu size={22} strokeWidth={2} />
      </button>

      {/* Logo horizontal Shelwi en pill blanco sobre header oscuro */}
      <div style={{ background: '#fff', borderRadius: 10, padding: '4px 10px', display: 'flex', alignItems: 'center' }}>
        <img
          src="/icons/logo-horizontal-white-bg.png"
          alt="Shelwi"
          style={{ height: 28, width: 'auto', objectFit: 'contain' }}
        />
      </div>

      {/* Campana de notificaciones */}
      <NotificationBell />
    </header>
  );
}
