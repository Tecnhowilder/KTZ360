/**
 * MobileHeader — UX 2026
 * Fondo blanco. ☰ izq · S Shelwi centro · 🔔 der
 * Fiel a mockup imagen 1.
 */
import { Menu } from 'lucide-react';
import { NotificationBell } from '../ui/NotificationBell';

interface MobileHeaderProps {
  onMenuOpen: () => void;
}

export function MobileHeader({ onMenuOpen }: MobileHeaderProps) {
  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      background: '#fff',
      borderBottom: '1px solid #F1F5F9',
      padding: '0 16px',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 'env(safe-area-inset-top)',
    }}>
      {/* Hamburger */}
      <button onClick={onMenuOpen} aria-label="Abrir menú" style={{
        border: 'none', background: 'none', padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 40, height: 40, color: '#374151', flexShrink: 0,
      }}>
        <Menu size={22} strokeWidth={2} />
      </button>

      {/* Logo: "S" icon + "Shelwi" text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: '#7C3AED',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 16, fontFamily: 'system-ui' }}>S</span>
        </div>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', letterSpacing: '-.4px' }}>Shelwi</span>
      </div>

      {/* Campana */}
      <NotificationBell />
    </header>
  );
}
