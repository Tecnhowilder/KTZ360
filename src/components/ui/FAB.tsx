/**
 * FAB — FabQuickActions UX 2026 (versión final)
 *
 * Esquina inferior derecha fija. NO se mueve al centro.
 * Al tocar: overlay sutil 20% + items en arco vertical hacia arriba.
 * Cada item: [cápsula blanca con texto] + [botón icono circular].
 * Animación: fade+scale, delay 40ms entre items, inverso al cerrar.
 * Long press 700ms: modo voz directo.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mic, FileText, Package, Camera, ClipboardList, Plus, X } from 'lucide-react';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FabAction {
  id:     string;
  label:  string;
  Icon:   React.ComponentType<{ size?: number; color?: string }>;
  color:  string;  // color del icono
  bg:     string;  // fondo del círculo
}

// ─── Acciones por defecto ─────────────────────────────────────────────────────
// Orden: de arriba hacia abajo (IA = primero/arriba = más importante)

export const DEFAULT_FAB_ACTIONS: FabAction[] = [
  { id: 'ia',       label: 'Crear con IA',      Icon: Mic,           color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'quote',    label: 'Nueva cotización',   Icon: FileText,      color: '#16A34A', bg: '#F0FDF4' },
  { id: 'order',    label: 'Nuevo pedido',       Icon: Package,       color: '#F97316', bg: '#FFF7ED' },
  { id: 'photo',    label: 'Desde imagen',       Icon: Camera,        color: '#2563EB', bg: '#EFF6FF' },
  { id: 'template', label: 'Desde plantilla',    Icon: ClipboardList, color: '#7C3AED', bg: '#F5F3FF' },
];

// ─── Componente ───────────────────────────────────────────────────────────────

interface FabQuickActionsProps {
  actions?: FabAction[];
}

export function FabQuickActions({ actions = DEFAULT_FAB_ACTIONS }: FabQuickActionsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { openQuoteFlow } = useUI();
  const { company } = useWorkspace();

  const [open,       setOpen]       = useState(false);
  const [showItems,  setShowItems]  = useState(false);
  const [voice,      setVoice]      = useState(false);
  const [listening,  setListening]  = useState(false);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers     = useRef<ReturnType<typeof setTimeout>[]>([]);

  const addTimer = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms); timers.current.push(t); return t;
  };

  // Limpiar al desmontar
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Cerrar al cambiar ruta
  useEffect(() => { if (open) doClose(); }, [location.pathname]); // eslint-disable-line

  // ESC
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) doClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [open]); // eslint-disable-line

  // Ocultar en flows internos
  const hide =
    location.pathname.startsWith('/app/cotizaciones/nueva') ||
    !!location.pathname.match(/^\/app\/cotizaciones\/.+\/editar/) ||
    location.pathname.startsWith('/app/ordenes-trabajo/') ||
    location.pathname.startsWith('/app/pedidos/') ||
    location.pathname.startsWith('/app/ia/desde-imagen');

  // ── Abrir
  function doOpen() {
    timers.current.forEach(clearTimeout); timers.current = [];
    setOpen(true);
    addTimer(() => setShowItems(true), 30);
  }

  // ── Cerrar (items desaparecen primero, luego overlay)
  const doClose = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setShowItems(false);
    addTimer(() => setOpen(false), 320);
  }, []); // eslint-disable-line

  // ── Acción del item
  function doAction(id: string) {
    doClose();
    setTimeout(() => {
      switch (id) {
        case 'ia':       navigate('/app/ia/crear'); break;
        case 'photo':    navigate('/app/ia/desde-imagen'); break;
        case 'quote':    openQuoteFlow({ cfg: defaultQConfig(company) }); break;
        case 'order':    navigate('/app/pedidos/nuevo'); break;
        case 'template': navigate('/app/plantillas'); break;
      }
    }, 200);
  }

  // ── Tap normal vs long press (700ms → modo voz)
  function onPointerDown() {
    if (open) return;
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      setOpen(true);
      setVoice(true);
      setListening(true);
    }, 700);
  }
  function onPointerUp() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
      if (!open) doOpen();
    }
  }
  function onPointerLeave() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  if (hide) return null;

  // Items en orden inverso para el render (el primero en la lista queda más arriba)
  const orderedItems = [...actions]; // IA arriba → plantilla abajo

  return (
    <>
      {/* Estilos de animación */}
      <style>{`
        @keyframes fab-wave {
          0%,100% { transform: scaleY(0.4); }
          50%      { transform: scaleY(1.4); }
        }
      `}</style>

      {/* ════ OVERLAY 20% ════ */}
      <div
        aria-hidden="true"
        onClick={doClose}
        style={{
          position:   'fixed', inset: 0, zIndex: 53,
          background: 'rgba(0,0,0,.20)',
          opacity:    open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
        }}
      />

      {/* ════ CONTENEDOR FAB — fijo esquina inferior derecha ════ */}
      <div style={{
        position:   'fixed',
        bottom:     'calc(88px + env(safe-area-inset-bottom) + 12px)',
        right:      16,
        zIndex:     54,
        display:    'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap:        10,
      }}>

        {/* ── Items del menú (aparecen sobre el FAB) ─────────────────── */}
        {orderedItems.map((action, i) => {
          const delay       = i * 40;
          const delayClose  = (orderedItems.length - 1 - i) * 40;
          const visible     = open && showItems;
          const Ic          = action.Icon;

          return (
            <div
              key={action.id}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        10,
                opacity:    visible ? 1 : 0,
                transform:  visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.88)',
                transition: visible
                  ? `opacity 180ms ease ${delay}ms, transform 180ms ease ${delay}ms`
                  : `opacity 150ms ease ${delayClose}ms, transform 150ms ease ${delayClose}ms`,
                pointerEvents: visible ? 'auto' : 'none',
              }}
            >
              {/* Cápsula blanca de texto (a la izquierda del icono) */}
              <button
                aria-label={action.label}
                onClick={() => doAction(action.id)}
                style={{
                  background:   '#fff',
                  border:       'none',
                  borderRadius: 999,
                  padding:      '8px 16px',
                  fontSize:     13.5,
                  fontWeight:   700,
                  color:        '#0F172A',
                  cursor:       'pointer',
                  boxShadow:    '0 2px 12px rgba(0,0,0,.14)',
                  whiteSpace:   'nowrap',
                  lineHeight:   1,
                  letterSpacing: '-.01em',
                }}
              >
                {action.label}
              </button>

              {/* Botón icono circular (a la derecha de la cápsula) */}
              <button
                aria-label={action.label}
                onClick={() => doAction(action.id)}
                style={{
                  width:        48,
                  height:       48,
                  borderRadius: '50%',
                  background:   action.bg,
                  border:       'none',
                  cursor:       'pointer',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  boxShadow:    '0 2px 12px rgba(0,0,0,.14)',
                  flexShrink:   0,
                  transition:   'transform .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <Ic size={22} color={action.color} />
              </button>
            </div>
          );
        })}

        {/* ── FAB principal ─────────────────────────────────────────── */}
        <button
          aria-label={open ? 'Cerrar menú' : 'Abrir menú de acciones rápidas'}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          6,
            padding:      '14px 22px',
            borderRadius: 999,
            border:       'none',
            background:   '#7C3AED',
            color:        '#fff',
            fontWeight:   800,
            fontSize:     16,
            cursor:       'pointer',
            boxShadow:    '0 4px 24px rgba(124,58,237,.5)',
            userSelect:   'none',
            WebkitUserSelect: 'none',
            transition:   'box-shadow .2s',
            minWidth:     open ? 48 : undefined,
            justifyContent: 'center',
          }}
        >
          {open
            ? <X size={22} strokeWidth={2.5} />
            : <><Plus size={20} strokeWidth={2.5} /> Nuevo</>
          }
        </button>
      </div>

      {/* ════ MODO VOZ ════ */}
      {voice && (
        <div style={{
          position:   'fixed', inset: 0, zIndex: 60,
          background: '#fff',
          display:    'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 44 }}>
            Mantén presionado para hablar
          </p>

          <div style={{ position: 'relative', marginBottom: 36 }}>
            {listening && (
              <div style={{
                position: 'absolute', inset: -18,
                borderRadius: '50%',
                background: '#7C3AED20',
                animation: 'fab-wave 1.1s ease-in-out infinite',
              }} />
            )}
            <button
              onPointerUp={() => { setListening(false); setTimeout(() => { setVoice(false); setOpen(false); navigate('/app/ia'); }, 500); }}
              aria-label="Escuchando"
              style={{
                width: 120, height: 120, borderRadius: '50%',
                background: '#7C3AED', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 30px rgba(124,58,237,.5)', position: 'relative', zIndex: 1,
              }}>
              <Mic size={50} color="#fff" />
            </button>
          </div>

          <p style={{ fontSize: 22, fontWeight: 800, color: '#7C3AED', marginBottom: 4 }}>
            Escuchando...
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 28 }}>
            Suelta para procesar
          </p>

          {/* Waveform */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 36 }}>
            {[6,14,24,18,30,12,22,8,28,16,24,8].map((h, i) => (
              <div key={i} style={{
                width: 3, height: h, borderRadius: 99,
                background: '#7C3AED',
                opacity: 0.5 + (i % 4) * 0.12,
                transformOrigin: 'center',
                animation: `fab-wave ${500 + i * 70}ms ease-in-out infinite alternate`,
              }} />
            ))}
          </div>

          <button
            onClick={() => { setVoice(false); setOpen(false); setListening(false); }}
            style={{ marginTop: 36, border: 'none', background: '#F1F5F9', color: '#374151', fontWeight: 600, fontSize: 14, padding: '10px 28px', borderRadius: 99, cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      )}
    </>
  );
}

// ─── Alias ────────────────────────────────────────────────────────────────────
export { FabQuickActions as FAB };
