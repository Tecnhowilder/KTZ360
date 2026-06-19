import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { signOut } from '../../services/auth';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';

interface UserMenuProps {
  children: ReactNode;
  placement?: 'top' | 'bottom';
  align?: 'left' | 'right';
}

const itemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  color: '#0F172A',
  fontWeight: 600,
  fontSize: 13,
  padding: '10px 14px',
  cursor: 'pointer',
  borderRadius: 8,
};

export function UserMenu({ children, placement = 'top', align = 'left' }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useWorkspace();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleLogout() {
    setOpen(false);
    try {
      await signOut();
    } finally {
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen((o) => !o)} style={{ cursor: 'pointer' }}>
        {children}
      </div>
      {open && (
        <div
          style={{
            position: 'absolute',
            ...(placement === 'top' ? { bottom: '100%', marginBottom: 8 } : { top: '100%', marginTop: 8 }),
            ...(align === 'left' ? { left: 0 } : { right: 0 }),
            minWidth: 200,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 12px 32px -8px rgba(15,23,42,.25)',
            border: '1px solid #E2E8F0',
            padding: 6,
            zIndex: 60,
          }}
        >
          {profile.role !== 'super_admin' && (
            <button style={itemStyle} onClick={() => { setOpen(false); navigate('/app/empresa'); }}>
              Perfil
            </button>
          )}
          {profile.role !== 'super_admin' && (
            <button style={itemStyle} onClick={() => { setOpen(false); navigate('/app/planes'); }}>
              Mi suscripción
            </button>
          )}
          <a
            href="mailto:soporte@shelwi.com"
            style={{ ...itemStyle, textDecoration: 'none', display: 'block' }}
            onClick={() => setOpen(false)}
          >
            Ayuda
          </a>
          <div style={{ height: 1, background: '#EEF2F7', margin: '4px 0' }} />
          <button style={{ ...itemStyle, color: '#DC2626' }} onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
