import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, LogOut } from 'lucide-react';
import { type NavId } from '../../lib/icons';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { isSuperAdmin } from '../../lib/permissions';
import { signOut } from '../../services/auth';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { profile, planName } = useWorkspace();
  const adminQuery = useQuery({ queryKey: ['isSuperAdmin'], queryFn: isSuperAdmin });

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
          background: '#fff',
          boxShadow: '6px 0 32px rgba(0,0,0,.18)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
          display: 'flex', flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* ── Header drawer UX 2026 ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 15 }}>S</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Shelwi</span>
          </div>
          <button onClick={onClose} aria-label="Cerrar menú" style={{ border: 'none', background: '#F1F5F9', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} color="#374151" />
          </button>
        </div>

        {/* ── Nav grupos ──────────────────────────────────────────────────── */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {/* PRINCIPAL */}
          {[
            { id: 'dashboard',    label: 'Inicio',        icon: '🏠' },
            { id: 'cotizaciones', label: 'Cotizaciones',  icon: '📋' },
            { id: 'pedidos',      label: 'Pedidos',       icon: '📦' },
            { id: 'clientes',     label: 'Clientes',      icon: '👥' },
          ].map(it => {
            const active = activeView === it.id;
            return (
              <button key={it.id} onClick={() => navTo(`/app/${it.id}`)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                width: '100%', padding: '13px 14px', marginBottom: 2,
                border: 'none', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                background: active ? '#F5F3FF' : 'transparent',
              }}>
                <span style={{ fontSize: 18 }}>{it.icon}</span>
                <span style={{ fontSize: 15, fontWeight: active ? 700 : 500, color: active ? '#7C3AED' : '#0F172A' }}>{it.label}</span>
              </button>
            );
          })}

          <div style={{ height: 1, background: '#F1F5F9', margin: '8px 4px' }} />

          {/* INTELIGENCIA */}
          {[
            { id: 'ia',      label: 'Shelwi IA', icon: '🤖' },
            { id: 'catalogo',label: 'Catálogo',  icon: '📚' },
            { id: 'reportes',label: 'Reportes',  icon: '📊' },
          ].map(it => {
            const active = activeView === it.id;
            return (
              <button key={it.id} onClick={() => navTo(`/app/${it.id}`)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                width: '100%', padding: '13px 14px', marginBottom: 2,
                border: 'none', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                background: active ? '#F5F3FF' : 'transparent',
              }}>
                <span style={{ fontSize: 18 }}>{it.icon}</span>
                <span style={{ fontSize: 15, fontWeight: active ? 700 : 500, color: active ? '#7C3AED' : '#0F172A' }}>{it.label}</span>
              </button>
            );
          })}

          <div style={{ height: 1, background: '#F1F5F9', margin: '8px 4px' }} />

          {/* ADMINISTRACIÓN */}
          {[
            ...(canManage ? [{ id: 'empresa', label: 'Mi Empresa', icon: '🏢' }, { id: 'team', label: 'Equipo', icon: '👤' }] : []),
            { id: 'config', label: 'Configuración', icon: '⚙️' },
          ].map(it => {
            const active = activeView === it.id;
            return (
              <button key={it.id} onClick={() => navTo(`/app/${it.id}`)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                width: '100%', padding: '13px 14px', marginBottom: 2,
                border: 'none', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                background: active ? '#F5F3FF' : 'transparent',
              }}>
                <span style={{ fontSize: 18 }}>{it.icon}</span>
                <span style={{ fontSize: 15, fontWeight: active ? 700 : 500, color: active ? '#7C3AED' : '#0F172A' }}>{it.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid #F1F5F9', padding: '12px 12px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
              {initial}
            </div>
            <div style={{ lineHeight: 1.3, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.full_name || profile.email}
              </div>
              <div style={{ fontSize: 11, color: '#64748B' }}>Plan {planName}</div>
            </div>
          </div>
          <button onClick={handleSignOut} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', border: 'none', background: 'none',
            color: '#DC2626', padding: '12px 14px', borderRadius: 12,
            cursor: 'pointer', fontWeight: 600, fontSize: 14,
          }}>
            <LogOut size={16} color="#DC2626" /> Cerrar sesión
          </button>
        </div>
      </div>
    </>
  );
}
