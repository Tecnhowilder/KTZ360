/**
 * MobileDashboard — Diseño premium mobile-first basado en referencia visual aprobada.
 * Se renderiza únicamente cuando navMode === 'bottom' (< 760 px).
 * El AppShell suprime el MobileHeader global en esta ruta.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Menu, ChevronRight } from 'lucide-react';
import { MobileDrawer } from '../layout/MobileDrawer';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { useDerivedQuotes } from '../../hooks/useQuotes';
import { daysAgo, TODAY } from '../../lib/calc';
import { getQuoteViewStats } from '../../services/quoteViews';

// ─── Constantes ───────────────────────────────────────────────────────────────

function relTime(dateStr: string): string {
  const h = Math.floor((TODAY().getTime() - new Date(dateStr).getTime()) / 3600000);
  if (h < 1)  return 'Hace < 1h';
  if (h < 24) return `Hace ${h}h`;
  if (h < 48) return 'Ayer';
  return `Hace ${Math.floor(h / 24)}d`;
}

// ────────────────────────────────────────────────────────────────────────────

// ─── MobileDashboard (root) ───────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD 2026 — Centro de Trabajo Inteligente
// Fiel al mockup UX 2026. Reutiliza todos los datos existentes.
// ════════════════════════════════════════════════════════════════════════════

export function MobileDashboard() {
  const navigate = useNavigate();
  const { profile, company, workspace } = useWorkspace();
  const { openQuoteFlow, openQuoteDetail } = useUI();
  const { quotes, isLoading } = useDerivedQuotes();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const quoteIds = useMemo(() => quotes.map(q => q.id), [quotes]);

  const { data: viewStats = [] } = useQuery({
    queryKey: ['quoteViews', workspace.id],
    queryFn:  () => getQuoteViewStats(quoteIds),
    enabled:  quoteIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  void viewStats;

  if (isLoading) return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }} />
  );

  // ── Datos derivados ────────────────────────────────────────────────────────
  const firstName = (profile.full_name || '').split(' ')[0] || 'Usuario';
  const h = new Date().getHours();
  const greet = h < 12 ? '¡Buenos días' : h < 18 ? '¡Buenas tardes' : '¡Buenas noches';

  // Trabajo pendiente — cotizaciones
  const cotizPorResponder = quotes.filter(q => q.status === 'Enviada').length;
  const seguimientosPend  = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 2).length;

  // Pipeline de ventas
  const aprobadas = quotes.filter(q => q.status === 'Aprobada').length;
  const pendientes= quotes.filter(q => ['Enviada','Vista','Borrador'].includes(q.status)).length;
  const perdidas  = quotes.filter(q => ['Rechazada','Vencida'].includes(q.status)).length;
  const pipeline  = { total: quotes.length, aprobadas, pendientes, perdidas };

  // Actividad reciente
  const recent = [...quotes]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 4);

  const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    Enviada:   { label: 'Enviada',   color: '#2563EB', bg: '#EFF6FF' },
    Aprobada:  { label: 'Aprobada',  color: '#16A34A', bg: '#F0FDF4' },
    Rechazada: { label: 'Rechazada', color: '#DC2626', bg: '#FEF2F2' },
    Vencida:   { label: 'Vencida',   color: '#D97706', bg: '#FFF7ED' },
    Vista:     { label: 'Vista',     color: '#0891B2', bg: '#ECFEFF' },
    Borrador:  { label: 'Borrador',  color: '#64748B', bg: '#F1F5F9' },
  };

  // Colores de avatar
  const AV = ['#7C3AED','#2563EB','#16A34A','#D97706','#DC2626','#0891B2'];
  const av  = (name: string) => AV[(name||'?').charCodeAt(0) % AV.length];

  // Pipeline bar widths
  const pipeW = (n: number) => `${Math.max(4, Math.round((n / Math.max(quotes.length,1)) * 100))}%`;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', paddingBottom: 96 }}>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* ── Header interno ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: '#fff',
        borderBottom: '1px solid #F1F5F9',
        paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
      }}>
        <button onClick={() => setDrawerOpen(true)} aria-label="Menú" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
          <Menu size={22} color="#374151" />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 14 }}>S</span>
          </div>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Shelwi</span>
        </div>
        <NotifBell />
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 16 }}>

        {/* ── Saludo ──────────────────────────────────────────────────────── */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.2 }}>
            {greet}, {firstName}!
          </h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0' }}>
            Aquí tienes el resumen de tu actividad
          </p>
        </div>

        {/* ── Acciones rápidas ─────────────────────────────────────────────── */}
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 10px' }}>Acciones rápidas</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {[
              { icon: '🎤', label: 'Hablar con IA',    color: '#7C3AED', bg: '#F5F3FF', action: () => navigate('/app/ia') },
              { icon: '📄', label: 'Nueva cotización', color: '#2563EB', bg: '#EFF6FF', action: () => openQuoteFlow({ cfg: defaultQConfig(company) }) },
              { icon: '📦', label: 'Nuevo pedido',     color: '#F97316', bg: '#FFF7ED', action: () => navigate('/app/pedidos') },
              { icon: '📷', label: 'Desde foto',       color: '#64748B', bg: '#F1F5F9', action: () => navigate('/app/ia') },
            ].map(a => (
              <button key={a.label} onClick={a.action} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '14px 4px 10px', border: `1.5px solid ${a.bg}`,
                borderRadius: 14, background: '#fff', cursor: 'pointer',
              }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  {a.icon}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#374151', textAlign: 'center', lineHeight: 1.3 }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Trabajo pendiente ─────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ padding: '14px 16px 10px', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
            Trabajo pendiente
          </div>
          {[
            { icon: '📋', label: 'Cotizaciones por responder', count: cotizPorResponder, path: '/app/cotizaciones?estado=Enviada' },
            { icon: '📦', label: 'Pedidos en proceso',         count: 0,                  path: '/app/pedidos' },
            { icon: '⚙️', label: 'Órdenes de trabajo hoy',     count: 0,                  path: '/app/ordenes-trabajo' },
            { icon: '🔔', label: 'Seguimientos pendientes',    count: seguimientosPend,   path: '/app/cotizaciones?estado=Enviada' },
          ].map((item, i) => (
            <button key={item.label} onClick={() => navigate(item.path)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                borderTop: i > 0 ? '1px solid #F8FAFC' : 'none',
              }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
              <span style={{ flex: 1, fontSize: 13.5, color: '#374151', fontWeight: 500 }}>{item.label}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: item.count > 0 ? '#7C3AED' : '#94A3B8', minWidth: 20, textAlign: 'right' }}>
                {item.count}
              </span>
              <ChevronRight size={16} color="#CBD5E1" />
            </button>
          ))}
        </div>

        {/* ── Pipeline de ventas ───────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Pipeline de ventas</span>
            <button onClick={() => navigate('/app/pipeline')} style={{ border: 'none', background: 'none', fontSize: 13, fontWeight: 700, color: '#7C3AED', cursor: 'pointer' }}>
              Ver todo
            </button>
          </div>
          {/* Barra multicolor */}
          <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', gap: 2, marginBottom: 14 }}>
            <div style={{ width: pipeW(pendientes), background: '#2563EB', borderRadius: 99 }} />
            <div style={{ width: pipeW(aprobadas),  background: '#22C55E', borderRadius: 99 }} />
            <div style={{ width: pipeW(seguimientosPend), background: '#F97316', borderRadius: 99 }} />
            <div style={{ width: pipeW(perdidas),   background: '#EF4444', borderRadius: 99 }} />
          </div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {[
              { label: 'Cotizaciones', value: pipeline.total,     color: '#374151' },
              { label: 'Aprobadas',    value: pipeline.aprobadas,  color: '#16A34A' },
              { label: 'Pendientes',   value: pipeline.pendientes, color: '#F97316' },
              { label: 'Perdidas',     value: pipeline.perdidas,   color: '#DC2626' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Actividad reciente ───────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ padding: '14px 16px 10px', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
            Actividad reciente
          </div>
          {recent.length === 0 && (
            <div style={{ padding: '12px 16px 16px', fontSize: 13, color: '#94A3B8' }}>Sin actividad reciente.</div>
          )}
          {recent.map((q, i) => {
            const badge = STATUS_BADGE[q.status] ?? STATUS_BADGE.Borrador;
            const initial = (q.clientName || '?').trim().charAt(0).toUpperCase();
            return (
              <button key={q.id} onClick={() => openQuoteDetail(q.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                  borderTop: i > 0 ? '1px solid #F8FAFC' : 'none',
                }}>
                {/* Avatar */}
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: av(q.clientName) + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: av(q.clientName) }}>{initial}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Cotización a {q.clientName}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{relTime(q.updated_at)}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg, borderRadius: 99, padding: '3px 8px', flexShrink: 0 }}>
                  {badge.label}
                </span>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}

// Campana de notificaciones inline (evita importar NotificationBell que puede cambiar)
function NotifBell() {
  return (
    <button aria-label="Notificaciones" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, position: 'relative' }}>
      <Bell size={22} color="#374151" />
    </button>
  );
}
