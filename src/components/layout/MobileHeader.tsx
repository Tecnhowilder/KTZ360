import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { APP_NAME } from '../../lib/brand';
import { UserMenu } from './UserMenu';

export function MobileHeader() {
  const { profile } = useWorkspace();
  const initial = (profile.full_name || profile.email || '?').trim().charAt(0).toUpperCase();

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 35,
        background: 'rgba(255,255,255,.9)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #EEF2F7',
        padding: '13px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <img src="/icons/logo-light.png" alt="KTZ360" style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.6px' }}>{APP_NAME}</span>
      </div>
      <UserMenu placement="bottom" align="right">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            background: 'linear-gradient(150deg,#2563EB,#1D4ED8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
          }}
        >
          {initial}
        </div>
      </UserMenu>
    </header>
  );
}
