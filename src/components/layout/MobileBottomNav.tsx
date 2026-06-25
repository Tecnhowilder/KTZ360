/**
 * MobileBottomNav — UX 2026
 * 5 tabs: Inicio · Cotizar · Pedidos · Clientes · Más
 * Sheet "Más" con grupos OPERACIÓN / NEGOCIO / ADMINISTRACIÓN.
 */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, FileText, Package, Users, MoreHorizontal,
  MapPin, BarChart2, Sparkles, Building2, UserCog,
  Settings, LogOut, Wrench, X,
} from 'lucide-react';
import { signOut } from '../../services/auth';
import { useQueryClient } from '@tanstack/react-query';

const PRIMARY = '#7C3AED';

const MAIN_TABS = [
  { path: '/app/dashboard',    icon: Home,       label: 'Inicio'   },
  { path: '/app/cotizaciones', icon: FileText,   label: 'Cotizar'  },
  { path: '/app/pedidos',      icon: Package,    label: 'Pedidos'  },
  { path: '/app/clientes',     icon: Users,      label: 'Clientes' },
];

const MORE_GROUPS = [
  {
    label: 'OPERACIÓN',
    items: [
      { path: '/app/pedidos',         icon: Package,  label: 'Pedidos' },
      { path: '/app/ordenes-trabajo', icon: Wrench,   label: 'Órdenes de trabajo' },
      { path: '/app/mapa-operativo',  icon: MapPin,   label: 'Mapa GPS', badge: 'En tiempo real' },
    ],
  },
  {
    label: 'NEGOCIO',
    items: [
      { path: '/app/catalogo', icon: Package,   label: 'Catálogo' },
      { path: '/app/reportes', icon: BarChart2, label: 'Reportes' },
      { path: '/app/ia',       icon: Sparkles,  label: 'Shelwi IA' },
    ],
  },
  {
    label: 'ADMINISTRACIÓN',
    items: [
      { path: '/app/empresa', icon: Building2, label: 'Mi Empresa' },
      { path: '/app/team',    icon: UserCog,   label: 'Equipo' },
      { path: '/app/config',  icon: Settings,  label: 'Configuración' },
    ],
  },
];

export function MobileBottomNav() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const queryClient = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) => location.pathname.startsWith(path);

  async function handleSignOut() {
    setMoreOpen(false);
    await signOut();
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  function go(path: string) {
    navigate(path);
    setMoreOpen(false);
  }

  return (
    <>
      {/* ── Bar ──────────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        background: '#fff',
        borderTop: '1px solid #F1F5F9',
        paddingBottom: 'env(safe-area-inset-bottom)',
        display: 'flex',
      }}>
        {MAIN_TABS.map(({ path, icon: Ic, label }) => {
          const active = isActive(path);
          return (
            <button key={path} onClick={() => navigate(path)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, padding: '10px 4px 8px',
              border: 'none', background: 'none', cursor: 'pointer',
            }}>
              <Ic size={22} color={active ? PRIMARY : '#94A3B8'} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? PRIMARY : '#94A3B8' }}>
                {label}
              </span>
            </button>
          );
        })}

        <button onClick={() => setMoreOpen(true)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 3, padding: '10px 4px 8px',
          border: 'none', background: 'none', cursor: 'pointer',
        }}>
          <MoreHorizontal size={22} color={moreOpen ? PRIMARY : '#94A3B8'} strokeWidth={moreOpen ? 2.2 : 1.8} />
          <span style={{ fontSize: 10, fontWeight: moreOpen ? 700 : 500, color: moreOpen ? PRIMARY : '#94A3B8' }}>
            Más
          </span>
        </button>
      </nav>

      {/* ── Backdrop ─────────────────────────────────────────────────────────── */}
      <div onClick={() => setMoreOpen(false)} style={{
        position: 'fixed', inset: 0, zIndex: 48,
        background: 'rgba(0,0,0,.4)',
        opacity: moreOpen ? 1 : 0,
        pointerEvents: moreOpen ? 'auto' : 'none',
        transition: 'opacity .25s',
      }} />

      {/* ── Sheet "Más" ───────────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 49,
        background: '#fff',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,.15)',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        transform: moreOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* Header sheet */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 8px' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Más opciones</span>
          <button onClick={() => setMoreOpen(false)} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#374151" />
          </button>
        </div>

        {MORE_GROUPS.map(group => (
          <div key={group.label}>
            <div style={{ padding: '8px 20px 4px', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px' }}>
              {group.label}
            </div>
            {group.items.map(item => {
              const Ic = item.icon;
              return (
                <button key={item.path} onClick={() => go(item.path)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic size={18} color="#374151" />
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 500, color: '#0F172A', flex: 1 }}>{item.label}</span>
                  {'badge' in item && item.badge && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', borderRadius: 99, padding: '2px 8px' }}>{item.badge as string}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        <div style={{ height: 1, background: '#F1F5F9', margin: '8px 20px' }} />
        <button onClick={handleSignOut} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={18} color="#DC2626" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#DC2626' }}>Cerrar sesión</span>
        </button>
      </div>
    </>
  );
}
