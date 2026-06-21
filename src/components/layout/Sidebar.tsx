import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon, NAV_ICONS, NAV_ITEMS, type NavId } from '../../lib/icons';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { isSuperAdmin } from '../../lib/permissions';
import { getThemeByPlan } from '../../lib/planTheme';
import { UserMenu } from './UserMenu';

interface SidebarProps {
  width: number;
  rail: boolean;
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

const TRANSITION = 'background 0.5s ease, box-shadow 0.4s ease, color 0.3s ease, border-color 0.3s ease';

export function Sidebar({ width, rail }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, planName, company } = useWorkspace();
  const { openQuoteFlow } = useUI();
  const adminQuery = useQuery({ queryKey: ['isSuperAdmin'], queryFn: isSuperAdmin });

  const theme = getThemeByPlan(planName);

  const rawView    = location.pathname.split('/')[2];
  const activeView = (rawView === 'ordenes-trabajo' ? 'ordenesDeTrabajo' : rawView) as NavId | undefined;
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
        background: theme.sidebarBg,
        boxShadow: theme.sidebarShadow,
        display: 'flex',
        flexDirection: 'column',
        padding: '18px 14px',
        zIndex: 40,
        transition: TRANSITION,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: navJustify, padding: '6px 6px 18px' }}>
        {rail ? (
          // Modo mini: solo el ícono cuadrado
          <img src="/icons/favicon-64.png" alt="Shelwi" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 8, flexShrink: 0 }} />
        ) : (
          // Modo full: logo horizontal en contenedor blanco redondeado
          <div style={{ background: '#fff', borderRadius: 10, padding: '5px 10px', display: 'inline-flex', alignItems: 'center' }}>
            <img
              src="/icons/logo-horizontal-white-bg.png"
              alt="Shelwi"
              style={{ height: 30, width: 'auto', objectFit: 'contain' }}
            />
          </div>
        )}
      </div>

      {/* Nav items */}
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
                    background: active ? theme.activeNavBg : 'transparent',
                    color: active ? '#fff' : '#94A3B8',
                    padding: '11px 12px',
                    borderRadius: 11,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    textAlign: 'left',
                    justifyContent: navJustify,
                    transition: TRANSITION,
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
                  onClick={() => navigate(`/app/${it.id === 'ordenesDeTrabajo' ? 'ordenes-trabajo' : it.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 13,
                    width: '100%',
                    border: 'none',
                    background: active ? theme.activeNavBg : 'transparent',
                    color: active ? '#fff' : '#94A3B8',
                    padding: '11px 12px',
                    borderRadius: 11,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    textAlign: 'left',
                    justifyContent: navJustify,
                    position: 'relative',
                    transition: TRANSITION,
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
                        background: theme.badgeBg,
                        color: theme.badgeColor,
                        padding: '2px 6px',
                        borderRadius: 6,
                        letterSpacing: '.5px',
                        transition: TRANSITION,
                      }}
                    >
                      PRO
                    </span>
                  )}
                </button>
              );
            })}
      </div>

      {/* CTA / Admin link */}
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
            background: theme.ctaBg,
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
            boxShadow: theme.ctaShadow,
            transition: TRANSITION,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          <span style={{ display: labelDisplay }}>Nueva cotización</span>
        </button>
      )}

      {/* User profile */}
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
              background: theme.avatarBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              flexShrink: 0,
              transition: TRANSITION,
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
