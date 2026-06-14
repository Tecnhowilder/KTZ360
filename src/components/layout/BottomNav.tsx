import { useNavigate, useLocation } from 'react-router-dom';
import { Icon, NAV_ICONS, BOTTOM_NAV_ITEMS, type NavId } from '../../lib/icons';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { company } = useWorkspace();
  const { openQuoteFlow } = useUI();
  const activeView = location.pathname.split('/')[2] as NavId | undefined;

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 35,
        background: '#fff',
        borderTop: '1px solid #EEF2F7',
        padding: '9px 16px calc(9px + env(safe-area-inset-bottom))',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      {BOTTOM_NAV_ITEMS.map((b) => {
        const active = activeView === b.id;
        return (
          <button
            key={b.id}
            onClick={() => navigate(`/app/${b.id}`)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              color: active ? '#2563EB' : '#94A3B8',
              flex: 1,
            }}
          >
            <span style={{ width: 23, height: 23, display: 'flex' }}>
              <Icon path={NAV_ICONS[b.id]} />
            </span>
            <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 600 }}>{b.label}</span>
          </button>
        );
      })}
      <button
        onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          top: -22,
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: '#2563EB',
          border: '4px solid #fff',
          color: '#fff',
          fontSize: 30,
          fontWeight: 300,
          cursor: 'pointer',
          boxShadow: '0 8px 20px -6px rgba(37,99,235,.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        +
      </button>
    </nav>
  );
}
