import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, LogOut, Plus } from 'lucide-react';
import { Icon, NAV_ICONS, NAV_ITEMS, type NavId } from '../../lib/icons';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { isSuperAdmin } from '../../lib/permissions';
import { getThemeByPlan } from '../../lib/planTheme';
import { signOut } from '../../services/auth';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { profile, planName, company } = useWorkspace();
  const { openQuoteFlow } = useUI();
  const adminQuery = useQuery({ queryKey: ['isSuperAdmin'], queryFn: isSuperAdmin });
  const theme = getThemeByPlan(planName);

  const activeView = location.pathname.split('/')[2] as NavId | undefined;

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canManage = profile.role === 'owner' || !!adminQuery.data;
  const navItems = NAV_ITEMS
    .filter(it => !['empresa', 'planes', 'team'].includes(it.id) || canManage)
    .concat(adminQuery.data ? [{ id: 'admin' as NavId, label: 'Admin', badge: false }] : []);

  const initial = (profile.full_name || profile.email || '?').trim().charAt(0).toUpperCase();

  const navTo = (path: string) => {
    navigate(path);
    onClose();
  };

  async function handleSignOut() {
    onClose();
    try { await signOut(); } finally {
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  }

  const TRANSITION = 'background 0.5s ease, box-shadow 0.4s ease';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 48,
          background: 'rgba(0,0,0,.4)',
          backdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .25s ease',
        }}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: '82vw', maxWidth: 300,
          zIndex: 49,
          background: theme.sidebarBg,
          boxShadow: '6px 0 32px rgba(0,0,0,.25)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
          display: 'flex', flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#fff', borderRadius: 9, padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                <img src="/icons/logo-horizontal-white-bg.png" alt="Shelwi" style={{ height: 26, width: 'auto', objectFit: 'contain' }} />
              </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar menú"
            style={{ border: 'none', background: 'rgba(255,255,255,.1)', color: '#fff', width: 34, height: 34, borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* CTA */}
        <div style={{ padding: '0 10px 10px' }}>
          <button
            onClick={() => { openQuoteFlow({ cfg: defaultQConfig(company) }); onClose(); }}
            style={{
              width: '100%', border: 'none', background: theme.ctaBg, color: '#fff',
              fontWeight: 700, fontSize: 14, padding: '12px 0', borderRadius: 13,
              cursor: 'pointer', boxShadow: theme.ctaShadow,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              minHeight: 48, transition: TRANSITION,
            }}
          >
            <Plus size={17} strokeWidth={2.5} /> Nueva cotización
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          {navItems.map(it => {
            const active = activeView === it.id;
            return (
              <button
                key={it.id}
                onClick={() => navTo(`/app/${it.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 13,
                  width: '100%', border: 'none',
                  background: active ? theme.activeNavBg : 'transparent',
                  color: active ? '#fff' : '#94A3B8',
                  padding: '13px 12px', borderRadius: 12,
                  cursor: 'pointer', fontWeight: 600, fontSize: 14.5,
                  textAlign: 'left', minHeight: 50, transition: TRANSITION,
                }}
              >
                <span style={{ width: 22, height: 22, display: 'flex', flexShrink: 0 }}>
                  <Icon path={NAV_ICONS[it.id]} />
                </span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {(it as { badge?: boolean }).badge && (
                  <span style={{ fontSize: 9, fontWeight: 800, background: theme.badgeBg, color: theme.badgeColor, padding: '2px 6px', borderRadius: 5 }}>
                    PRO
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer: user info + logout */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '10px 10px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, background: 'rgba(255,255,255,.06)', marginBottom: 8 }}>
            <div
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: theme.avatarBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0,
                transition: TRANSITION,
              }}
            >
              {initial}
            </div>
            <div style={{ lineHeight: 1.3, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.full_name || profile.email}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Plan {planName}</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', border: 'none', background: 'rgba(239,68,68,.12)',
              color: '#FCA5A5', padding: '12px 14px', borderRadius: 12,
              cursor: 'pointer', fontWeight: 600, fontSize: 14, minHeight: 48,
            }}
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </div>
    </>
  );
}
