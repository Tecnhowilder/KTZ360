import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon, NAV_ICONS, NAV_ITEMS, type NavId } from '../../lib/icons';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { isSuperAdmin } from '../../lib/permissions';
import { APP_NAME } from '../../lib/brand';
import { UserMenu } from './UserMenu';

interface SidebarProps {
  width: number;
  rail: boolean; // true = solo iconos centrados, false = full con labels
}

const SUPER_ADMIN_NAV: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'subscriptions', label: 'Suscripciones' },
  { id: 'plans', label: 'Planes' },
  { id: 'users', label: 'Usuarios' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'audit', label: 'Auditoría' },
  { id: 'system', label: 'Configuración' },
  { id: 'support', label: 'Soporte' },
];

export function Sidebar({ width, rail }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, planName, company } = useWorkspace();
  const { openQuoteFlow } = useUI();
  const adminQuery = useQuery({ queryKey: ['isSuperAdmin'], queryFn: isSuperAdmin });

  const activeView = location.pathname.split('/')[2] as NavId | undefined;
  const activeTab = new URLSearchParams(location.search).get('tab') ?? 'dashboard';
  const navJustify = rail ? 'center' : 'flex-start';
  const labelDisplay = rail ? 'none' : 'inline';
  const profileDisplay = rail ? 'none' : 'flex';

  const isSuperAdminUser = profile.role === 'super_admin';

  const canManage = profile.role === 'owner' || !!adminQuery.data;
  const navItems = NAV_ITEMS
    .filter((it) => !['empresa', 'planes', 'team'].includes(it.id) || canManage)
    .concat(adminQuery.data ? [{ id: 'admin' as NavId, label: 'Admin' }] : []);

  const initial = (profile.full_name || profile.email || '?').trim().charAt(0).toUpperCase();

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width,
        background: '#0F172A',
        display: 'flex',
        flexDirection: 'column',
        padding: '18px 14px',
        zIndex: 40,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '6px 6px 18px', justifyContent: navJustify }}>
        {!rail && (
          <img src="/icons/logo-dark.png" alt="KTZ360" style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
        )}
        {rail && (
          <img src="/icons/logo-icon.png" alt="KTZ360" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
        )}
        <span style={{ fontWeight: 800, fontSize: 20, color: '#fff', letterSpacing: '-.8px', display: labelDisplay }}>
          {APP_NAME}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, flex: 1, overflowY: 'auto' }}>
        {isSuperAdminUser
          ? SUPER_ADMIN_NAV.map((it) => {
              const active = activeView === 'admin' && activeTab === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => navigate(`/app/admin?tab=${it.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 13,
                    width: '100%',
                    border: 'none',
                    background: active ? 'rgba(59,130,246,.16)' : 'transparent',
                    color: active ? '#fff' : '#94A3B8',
                    padding: '11px 12px',
                    borderRadius: 11,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    textAlign: 'left',
                    justifyContent: navJustify,
                  }}
                >
                  <span style={{ width: 21, height: 21, flexShrink: 0, display: 'flex' }}>
                    <Icon path={NAV_ICONS.admin} />
                  </span>
                  <span style={{ display: labelDisplay, whiteSpace: 'nowrap' }}>{it.label}</span>
                </button>
              );
            })
          : navItems.map((it) => {
          const active = activeView === it.id;
          return (
            <button
              key={it.id}
              onClick={() => navigate(`/app/${it.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                width: '100%',
                border: 'none',
                background: active ? 'rgba(59,130,246,.16)' : 'transparent',
                color: active ? '#fff' : '#94A3B8',
                padding: '11px 12px',
                borderRadius: 11,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14,
                textAlign: 'left',
                justifyContent: navJustify,
                position: 'relative',
              }}
            >
              <span style={{ width: 21, height: 21, flexShrink: 0, display: 'flex' }}>
                <Icon path={NAV_ICONS[it.id]} />
              </span>
              <span style={{ display: labelDisplay, whiteSpace: 'nowrap' }}>{it.label}</span>
              {it.badge && (
                <span
                  style={{
                    display: labelDisplay,
                    marginLeft: 'auto',
                    fontSize: 9,
                    fontWeight: 800,
                    background: '#22C55E',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: 6,
                    letterSpacing: '.5px',
                  }}
                >
                  PRO
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isSuperAdminUser ? (
        <button
          onClick={() => navigate('/app/dashboard')}
          style={{
            marginTop: 10,
            border: '1px solid rgba(255,255,255,.12)',
            background: 'transparent',
            color: '#94A3B8',
            fontWeight: 700,
            fontSize: 13,
            padding: 12,
            borderRadius: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            justifyContent: 'center',
          }}
        >
          <span style={{ display: labelDisplay }}>Ver app comercial</span>
          <span style={{ display: rail ? 'inline' : 'none' }}>↗</span>
        </button>
      ) : (
        <button
          onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
          style={{
            marginTop: 10,
            border: 'none',
            background: '#2563EB',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            padding: 12,
            borderRadius: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            justifyContent: 'center',
            boxShadow: '0 8px 18px -8px rgba(37,99,235,.7)',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          <span style={{ display: labelDisplay }}>Nueva cotización</span>
        </button>
      )}

      <UserMenu placement="top">
        <div
          style={{
            marginTop: 14,
            display: profileDisplay,
            alignItems: 'center',
            gap: 10,
            padding: 9,
            borderRadius: 11,
            background: 'rgba(255,255,255,.05)',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(150deg,#2563EB,#1D4ED8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ lineHeight: 1.2, overflow: 'hidden' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile.full_name || profile.email}
            </div>
            <div style={{ fontSize: 10.5, color: '#94A3B8' }}>
              {isSuperAdminUser ? 'Super Admin' : `Plan ${planName}`}
            </div>
          </div>
        </div>
      </UserMenu>
    </aside>
  );
}
