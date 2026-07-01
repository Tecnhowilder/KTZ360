# HOTFIX_QUOTES_REPORT.md — FAB Nueva Cotización Desaparecido
Fecha: 2026-06-23

## CAUSA RAÍZ

El FAB (botón flotante azul circular +) fue eliminado en el commit `46cd7b1` ("pantallas movil rediseñadas").

### Historia del FAB

**Antes del commit 46cd7b1:**
El FAB estaba en `src/views/Cotizaciones.tsx` (vista desktop compartida) con CSS media query:
```tsx
<button
  onClick={() => navigate('/app/cotizaciones/nueva')}
  style={{
    position: 'fixed', bottom: 'calc(76px + env(safe-area-inset-bottom))',
    right: 16, zIndex: 30,
    width: 56, height: 56, borderRadius: '50%',
    background: '#2563EB', border: 'none', color: '#fff',
    boxShadow: '0 4px 20px rgba(37,99,235,.45)',
  }}
  className="mobile-fab"
>
  <Plus size={24} strokeWidth={2.5} />
</button>
<style>{`
  @media (min-width: 768px) {
    .mobile-fab { display: none !important; }
  }
`}</style>
```

**Después del commit 46cd7b1:**
- Se creó `CotizacionesMobile.tsx` como componente separado para mobile.
- `Cotizaciones.tsx` detecta mobile y delega: `if (navMode === 'bottom') return <CotizacionesMobile />;`
- **El FAB NO se incluyó en `CotizacionesMobile.tsx`.**
- Solo existe una sección de "Acciones rápidas" al FONDO de la pantalla (no fijada).

### Archivos afectados
- `src/components/cotizaciones/CotizacionesMobile.tsx` — falta el FAB

### Posición correcta
- Fixed, bottom: `calc(76px + env(safe-area-inset-bottom))` (encima del MobileBottomNav que tiene z-index 40)
- Right: 16px
- z-index: 45 (encima del bottom nav, debajo de modals)
- Size: 56×56px, borderRadius 50%
- Desktop: NO visible (solo mobile)
