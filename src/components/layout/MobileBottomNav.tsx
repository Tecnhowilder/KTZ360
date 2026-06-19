import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Users, Package, MoreHorizontal,
  BarChart2, Sparkles, Building2, UserCog, Settings, HelpCircle, LogOut, X,
} from 'lucide-react';
import { signOut } from '../../services/auth';
import { useQueryClient } from '@tanstack/react-query';

const TABS = [
  { path: '/app/dashboard',    icon: LayoutDashboard, label: 'Inicio' },
  { path: '/app/cotizaciones', icon: FileText,         label: 'Cotizaciones' },
  { path: '/app/clientes',     icon: Users,            label: 'Clientes' },
  { path: '/app/catalogo',     icon: Package,          label: 'Catálogo' },
];

const MORE_ITEMS = [
  { path: '/app/reportes',  icon: BarChart2,  label: 'Reportes' },
  { path: '/app/ia',        icon: Sparkles,   label: 'Shelwi IA' },
  { path: '/app/empresa',   icon: Building2,  label: 'Mi Empresa' },
  { path: '/app/team',      icon: UserCog,    label: 'Equipo y usuarios' },
  { path: '/app/config',    icon: Settings,   label: 'Configuración' },
];

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);

  const active = (path: string) => location.pathname.startsWith(path);

  async function handleSignOut() {
    setMoreOpen(false);
    await signOut();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  return (
    <>
      {/* Bottom nav bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        background: '#fff',
        borderTop: '1px solid #E2E8F0',
        paddingBottom: 'env(safe-area-inset-bottom)',
        display: 'flex', alignItems: 'stretch',
      }}>
        {TABS.map(tab => {
          const isActive = active(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 3, padding: '10px 0', border: 'none',
                background: 'none', cursor: 'pointer',
                color: isActive ? '#2563EB' : '#94A3B8',
                transition: 'color .15s',
              }}
            >
              <tab.icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, lineHeight: 1 }}>
                {tab.label}
              </span>
              {isActive && (
                <span style={{
                  position: 'absolute',
                  top: 0,
                  width: 28, height: 2, borderRadius: 99,
                  background: '#2563EB',
                }} />
              )}
            </button>
          );
        })}
        {/* Más */}
        <button
          onClick={() => setMoreOpen(true)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, padding: '10px 0', border: 'none',
            background: 'none', cursor: 'pointer',
            color: moreOpen ? '#2563EB' : '#94A3B8',
          }}
        >
          <MoreHorizontal size={22} strokeWidth={1.8} />
          <span style={{ fontSize: 10, fontWeight: 500, lineHeight: 1 }}>Más</span>
        </button>
      </nav>

      {/* More sheet overlay */}
      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 45,
              background: 'rgba(15,23,42,0.35)',
            }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: '#fff',
            borderRadius: '20px 20px 0 0',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 40px rgba(15,23,42,0.12)',
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 12px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Más opciones</span>
              <button onClick={() => setMoreOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Items */}
            <div style={{ padding: '0 12px' }}>
              {MORE_ITEMS.map(item => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMoreOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: '13px 12px', border: 'none',
                    cursor: 'pointer', borderRadius: 12, textAlign: 'left',
                    color: active(item.path) ? '#2563EB' : '#0F172A',
                    background: active(item.path) ? '#EFF6FF' : 'transparent',
                  }}
                >
                  <item.icon size={20} strokeWidth={1.8} color={active(item.path) ? '#2563EB' : '#64748B'} />
                  <span style={{ fontSize: 14.5, fontWeight: 500 }}>{item.label}</span>
                </button>
              ))}

              {/* Ayuda */}
              <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 12, color: '#0F172A' }}>
                <HelpCircle size={20} strokeWidth={1.8} color="#64748B" />
                <span style={{ fontSize: 14.5, fontWeight: 500 }}>Ayuda</span>
              </button>

              {/* Separador */}
              <div style={{ height: 1, background: '#F1F5F9', margin: '8px 0' }} />

              {/* Cerrar sesión */}
              <button
                onClick={handleSignOut}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 12, color: '#EF4444' }}
              >
                <LogOut size={20} strokeWidth={1.8} color="#EF4444" />
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
