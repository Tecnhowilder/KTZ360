/**
 * MobileBottomNav — Navegación adaptativa por rol y plan (Sprint 25)
 *
 * Los tabs y el menú "Más" cambian según:
 *   - Rol del usuario (owner, admin, supervisor, comercial, operario)
 *   - Feature flags del plan (gps_enabled, orders_enabled, etc.)
 *
 * La lógica de qué mostrar viene de useRoleNavigation() → roleNavigation.ts
 * SEGURIDAD: ocultar no es autorización. Todo sigue validándose en el backend.
 */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MoreHorizontal, LogOut, X } from 'lucide-react';
import { signOut } from '../../services/auth';
import { useQueryClient } from '@tanstack/react-query';
import { useRoleNavigation } from '../../hooks/useRoleNavigation';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';

const PRIMARY = '#7C3AED';

export function MobileBottomNav() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const queryClient = useQueryClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const { profile } = useWorkspace();
  const nav = useRoleNavigation();

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

  // Si no hay tabs (super_admin / support_admin), no renderizar el bottom nav
  if (nav.bottomTabs.length === 0) return null;

  return (
    <>
      {/* ── Bar ──────────────────────────────────────────────────────────────── */}
      <nav
        role="navigation"
        aria-label="Navegación principal"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
          background: '#fff',
          borderTop: '1px solid #F1F5F9',
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: 'flex',
        }}
      >
        {nav.bottomTabs.map(({ path, icon: Ic, label }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 3, padding: '10px 4px 8px',
                border: 'none', background: 'none', cursor: 'pointer',
              }}
            >
              <Ic size={22} color={active ? PRIMARY : '#94A3B8'} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? PRIMARY : '#94A3B8' }}>
                {label}
              </span>
            </button>
          );
        })}

        {/* Botón "Más" — solo si hay grupos en el menú */}
        {nav.moreGroups.length > 0 && (
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="Más opciones"
            aria-expanded={moreOpen}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, padding: '10px 4px 8px',
              border: 'none', background: 'none', cursor: 'pointer',
            }}
          >
            <MoreHorizontal size={22} color={moreOpen ? PRIMARY : '#94A3B8'} strokeWidth={moreOpen ? 2.2 : 1.8} />
            <span style={{ fontSize: 10, fontWeight: moreOpen ? 700 : 500, color: moreOpen ? PRIMARY : '#94A3B8' }}>
              Más
            </span>
          </button>
        )}
      </nav>

      {/* ── Backdrop ─────────────────────────────────────────────────────────── */}
      <div
        onClick={() => setMoreOpen(false)}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 48,
          background: 'rgba(0,0,0,.4)',
          opacity: moreOpen ? 1 : 0,
          pointerEvents: moreOpen ? 'auto' : 'none',
          transition: 'opacity .25s',
        }}
      />

      {/* ── Sheet "Más" ───────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Más opciones de navegación"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 49,
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -8px 40px rgba(0,0,0,.15)',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          transform: moreOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        {/* Header sheet */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 8px' }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Más opciones</span>
            {/* Indicador de rol */}
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, textTransform: 'capitalize' }}>
              {profile.full_name ?? ''} · {profile.role}
            </div>
          </div>
          <button
            onClick={() => setMoreOpen(false)}
            aria-label="Cerrar menú"
            style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} color="#374151" />
          </button>
        </div>

        {/* Grupos según rol + plan */}
        {nav.moreGroups.map(group => (
          <div key={group.label}>
            <div style={{ padding: '8px 20px 4px', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px' }}>
              {group.label}
            </div>
            {group.items.map(item => {
              const Ic = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => go(item.path)}
                  aria-label={item.label}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic size={18} color="#374151" />
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 500, color: '#0F172A', flex: 1 }}>{item.label}</span>
                  {item.badge && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', borderRadius: 99, padding: '2px 8px' }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {/* Cerrar sesión */}
        <div style={{ height: 1, background: '#F1F5F9', margin: '8px 20px' }} />
        <button
          onClick={handleSignOut}
          aria-label="Cerrar sesión"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer' }}
        >
          <div style={{ width: 38, height: 38, borderRadius: 11, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={18} color="#DC2626" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#DC2626' }}>Cerrar sesión</span>
        </button>
      </div>
    </>
  );
}
