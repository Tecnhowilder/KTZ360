import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useWindowWidth, navModeFor } from '../../hooks/useWindowWidth';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import { MobileDrawer } from './MobileDrawer';
import { BottomNav } from './BottomNav';
import { QuoteFlowOverlay } from '../overlays/QuoteFlowOverlay';
import { QuoteDetailOverlay } from '../overlays/QuoteDetailOverlay';
import { ClientDetailOverlay } from '../overlays/ClientDetailOverlay';
import { DocumentOverlay } from '../overlays/DocumentOverlay';
import { UpgradeModal } from '../upgrade/UpgradeModal';

export function AppShell() {
  const width = useWindowWidth();
  const navMode = navModeFor(width);
  const showSidebar = navMode !== 'bottom';
  const navBottom = navMode === 'bottom';
  const sidebarW = navMode === 'full' ? 232 : 76;
  const location = useLocation();
  const isFullWidthView = location.pathname.startsWith('/app/planes');

  const [drawerOpen, setDrawerOpen] = useState(false);

  const mainLeft = showSidebar ? sidebarW : 0;
  const mainPadTop = navBottom ? 16 : 28;
  const mainPadBottom = navBottom ? 96 : 48;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      {showSidebar && <Sidebar width={sidebarW} rail={navMode === 'rail'} />}

      {navBottom && (
        <>
          <MobileHeader onMenuOpen={() => setDrawerOpen(true)} />
          <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </>
      )}

      <main
        style={{
          marginLeft: mainLeft,
          padding: isFullWidthView
            ? `${mainPadTop}px clamp(8px,1.5vw,20px) ${mainPadBottom}px`
            : `${mainPadTop}px clamp(14px,3.5vw,36px) ${mainPadBottom}px`,
          minHeight: '100vh',
        }}
      >
        <div style={isFullWidthView ? undefined : { maxWidth: 1120, margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>

      {navBottom && <BottomNav />}

      <QuoteFlowOverlay />
      <QuoteDetailOverlay />
      <ClientDetailOverlay />
      <DocumentOverlay />
      <UpgradeModal />
    </div>
  );
}
