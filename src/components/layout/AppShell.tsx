import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUI } from '../../features/app/UIProvider';
import { useWindowWidth, navModeFor } from '../../hooks/useWindowWidth';
import { useSessionGuard } from '../../hooks/useSessionGuard';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileDrawer } from './MobileDrawer';
import { MobileBottomNav } from './MobileBottomNav';
import { ClientDetailOverlay } from '../overlays/ClientDetailOverlay';
import { DocumentOverlay } from '../overlays/DocumentOverlay';
import { UpgradeModal } from '../upgrade/UpgradeModal';
import { FAB } from '../ui/FAB';

export function AppShell() {
  useSessionGuard(); // Sprint 24: Session Security — detecta revocación y fuerza logout

  const navigate = useNavigate();
  const { _registerNavigate } = useUI();

  useEffect(() => { _registerNavigate(navigate); }, [navigate]);

  const width = useWindowWidth();
  const navMode = navModeFor(width);
  const showSidebar = navMode !== 'bottom';
  const navBottom = navMode === 'bottom';
  const sidebarW = navMode === 'full' ? 232 : 76;
  const location = useLocation();
  const isFullWidthView = location.pathname.startsWith('/app/planes');

  // Rutas full-screen (sin header mobile, pero SÍ con bottom nav)
  const isInnerFlow = location.pathname.startsWith('/app/cotizaciones/nueva')
    || location.pathname.match(/^\/app\/cotizaciones\/.+/) !== null;

  // Dashboard gestiona su propio header compacto — no usar el global
  const isDashboard = location.pathname === '/app/dashboard';

  const [drawerOpen, setDrawerOpen] = useState(false);

  const mainLeft = showSidebar ? sidebarW : 0;
  const mainPadTop = navBottom ? (isInnerFlow || isDashboard ? 0 : 64) : 28;
  const mainPadBottom = navBottom ? 88 : 48;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      {showSidebar && <Sidebar width={sidebarW} rail={navMode === 'rail'} />}

      {/* Header mobile en vistas principales (no en inner flows ni dashboard) */}
      {navBottom && !isInnerFlow && !isDashboard && (
        <>
          <MobileHeader onMenuOpen={() => setDrawerOpen(true)} />
          <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </>
      )}

      <main
        style={{
          marginLeft: mainLeft,
          padding: isInnerFlow
            ? `0 0 ${mainPadBottom}px` // inner: sin lateral, solo bottom
            : isFullWidthView
              ? `${mainPadTop}px clamp(8px,1.5vw,20px) ${mainPadBottom}px`
              : `${mainPadTop}px clamp(14px,3.5vw,36px) ${mainPadBottom}px`,
          minHeight: '100vh',
        }}
      >
        <div style={isFullWidthView || isInnerFlow ? undefined : { maxWidth: 1120, margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>

      {/* MobileBottomNav SIEMPRE visible en mobile (en todas las rutas) */}
      {navBottom && <MobileBottomNav />}

      <ClientDetailOverlay />
      <DocumentOverlay />
      <UpgradeModal />
      {navBottom && <FAB />}
    </div>
  );
}
