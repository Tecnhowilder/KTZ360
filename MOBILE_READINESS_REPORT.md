# MOBILE READINESS REPORT — SHELWI
**Fecha:** 23 de junio de 2026  
**Objetivo:** Evaluar estado actual para publicación en Android e iOS vía Capacitor o React Native.

---

## PUNTUACIÓN GLOBAL

| Área | Score | Estado |
|------|-------|--------|
| Navegación móvil | 10/10 | ✅ READY |
| Vistas mobile-first | 9/10 | ✅ READY |
| Cámara y archivos | 8/10 | ✅ READY |
| GPS | 9/10 | ✅ READY |
| Touch gestures | 6/10 | ⚠️ PARTIAL |
| Performance / Listas | 7/10 | ⚠️ PARTIAL |
| Offline / PWA | 4/10 | ❌ NOT READY |
| Capacitor compatibility | 4/10 | ❌ NOT READY |
| Accesibilidad | 4/10 | ❌ NOT READY |

### **SCORE TOTAL: 6.8/10 — APTO PARA WEB MOBILE, NO APTO AÚN PARA APP STORE**

---

## PARTE 1 — NAVEGACIÓN MÓVIL ✅ READY

### Componentes existentes
| Componente | Estado | Detalles |
|-----------|--------|---------|
| `MobileBottomNav.tsx` | ✅ READY | 4 tabs fijos + "Más" en sheet modal. `env(safe-area-inset-bottom)` implementado. |
| `MobileHeader.tsx` | ✅ READY | Header sticky. `env(safe-area-inset-top)` implementado. |
| `MobileDrawer.tsx` | ✅ READY | 82vw drawer con nav items, CTA, logout. Safe area top + bottom. |
| `AppShell.tsx` | ✅ READY | Orquesta layout por breakpoint. Padding dinámico correcto. |
| `useWindowWidth.ts` | ✅ READY | Hook con resize listener. `navModeFor()`: full/rail/bottom. |

### Breakpoints definidos
```
1024px → Desktop full sidebar
 760px → Tablet rail (sidebar colapsado)
<760px → Mobile bottom nav
 390px → iPhone 14 (target principal)
 430px → iPhone 14 Plus / Samsung S23
```

### Safe Area (iOS notch / Android gesture nav)
- `paddingTop: env(safe-area-inset-top)` → MobileHeader, MobileDrawer
- `paddingBottom: env(safe-area-inset-bottom)` → MobileBottomNav, MobileDrawer, sheets
- `paddingBottom: 80px` → todas las vistas con bottom nav

---

## PARTE 2 — VISTAS POR SECCIÓN

### Dashboard
| Vista | Estado | Detalles |
|-------|--------|---------|
| Dashboard (Desktop) | ✅ READY | `FreeDashboard`, `ProDashboard`, `PremiumDashboard` con grid responsive |
| MobileDashboard | ✅ READY | Componente dedicado con 12+ blocks optimizados |

### CRM y Pipeline
| Vista | Estado | Detalles |
|-------|--------|---------|
| Pipeline Mobile | ✅ READY | Kanban completo con swipe y seguimientos |
| Pipeline Desktop | ✅ READY | Board Kanban horizontal (fix Sprint 16.3) |
| Cotizaciones Mobile | ✅ READY | `CotizacionesMobile` dedicada |
| Clientes Mobile | ✅ READY | `ClientesMobile` dedicada |

### Operaciones (Sprint 6)
| Vista | Estado | Detalles |
|-------|--------|---------|
| Pedidos | ✅ READY | Comentario: "Mobile First: 390px → tablet → desktop" |
| OrdenesDeTrabajo | ✅ READY | Comentario: "Mobile First. PREMIUM only." |
| PedidoDetailPage | ✅ READY | Tabs: OTs, Evidencias, Bitácora, Snapshot |
| OTDetailPage | ✅ READY | GPS Check In/Out integrado |

### GPS y Operativo
| Vista | Estado | Detalles |
|-------|--------|---------|
| MapaOperativoPage | ✅ READY | Mobile-first con 2 modos (manager/operario) |
| CheckInOutButton | ✅ READY | Flujo consentimiento → GPS → check-in/out |
| MemberDetailSheet | ✅ READY | Bottom sheet responsive |
| OperationalMap | ✅ READY | MapLibre GL con lazy loading |

### BI, Growth, Customer Success, Finanzas
| Vista | Estado | Detalles |
|-------|--------|---------|
| GrowthPage | ✅ READY | Tabs scrollables, `minHeight: 100dvh` |
| BIPage | ✅ READY | 6 tabs KPI, header sticky, responsive |
| AutomatizacionesPage | ✅ READY | Grid 2-col KPI, tabs scroll |
| CustomerSuccessPage | ✅ READY | Score rings SVG, client cards flexibles |
| FinancePage | ✅ READY | Comentario: "Mobile-first 390px" |
| Reportes Mobile | ✅ READY | `ReportesMobile` dedicada |

### Administración
| Vista | Estado | Detalles |
|-------|--------|---------|
| AdminPanel | ⚠️ PARTIAL | Funcional en mobile pero diseñado para desktop (tablas anchas) |
| Team / Empresa | ⚠️ PARTIAL | Tienen versiones Mobile pero acceso solo para owner |

---

## PARTE 3 — CÁMARA Y ARCHIVOS ✅ READY

### EvidenceUploader — Flujo completo
```
1. Usuario selecciona tipo: Foto / Video / Audio / PDF / Firma
2. File input con capture="environment" abre cámara nativa (iOS/Android)
3. compressImage() → Canvas resize (max 1920px) + JPEG 0.82 quality
4. Preview antes de subir
5. uploadEvidence() → backend con quota validation
6. EvidenceGallery → Visor fullscreen con URLs firmadas
```

### Tipos soportados
| Tipo | Accept | Capture | Compresión |
|------|--------|---------|-----------|
| Foto | image/jpeg,png,webp | environment | ✅ Auto (canvas) |
| Video | video/mp4,mov,webm | — | ❌ No (peso directo) |
| Audio | audio/mpeg,wav,ogg | — | ❌ No |
| PDF | application/pdf | — | ❌ No |
| Firma | canvas → PNG | — | ✅ (canvas render) |

### Limitaciones
- Video/Audio: sin compresión → potencial subida de archivos grandes en 3G/4G
- Sin progreso por chunks (file única sin multipart streaming)

---

## PARTE 4 — GPS ✅ READY

```typescript
// src/services/gps.ts
const GPS_OPTIONS = {
  enableHighAccuracy: true,    // Máxima precisión
  timeout: 15_000,             // 15 segundos
  maximumAge: 30_000           // Acepta ubicación de hasta 30s
};

navigator.geolocation.getCurrentPosition(
  (pos) => resolve({ lat, lng, accuracy }),
  (err) => reject(errMessage),
  GPS_OPTIONS
)
```

| Aspecto | Estado | Detalles |
|---------|--------|---------|
| Tipo | ✅ ONE-SHOT | Sin `watchPosition()` — por diseño (no tracking continuo) |
| Timeout | ✅ | 15s con manejo de error claro |
| Permisos | ✅ | Consentimiento explícito via RPC `grant_gps_consent()` |
| Errores | ✅ | 3 casos: Denegado / Sin señal / Timeout |
| Compatibilidad web | ✅ | HTML5 Geolocation API estándar |
| Compatibilidad Capacitor | ✅ | Funciona igual con plugin `@capacitor/geolocation` drop-in |

---

## PARTE 5 — TOUCH GESTURES ⚠️ PARTIAL

### Implementado
| Componente | Gesto | Implementación |
|-----------|-------|---------------|
| `SignatureCapture.tsx` | Draw | `onTouchStart`, `onTouchMove`, `onTouchEnd` con `e.touches[0]` |
| `MobileDashboard.tsx` | Scroll carousel | CSS `scroll-snap` nativo (sin listeners) |
| `OnboardingPage.tsx` | Swipe slides | `onTouchStart`/`onTouchEnd` para detectar dirección |

### NO implementado (oportunidades)
- Swipe para navegar entre tabs en Pipeline/Reportes
- Pull-to-refresh en listas
- Pinch-to-zoom en mapa/evidencias
- Long press para selección múltiple

---

## PARTE 6 — OFFLINE / PWA ❌ NOT READY

### Estado actual
| Elemento | Estado | Detalles |
|----------|--------|---------|
| `manifest.json` | ✅ EXISTE | display: standalone, icons 96-512px, maskable |
| Meta tags PWA | ✅ EXISTE | viewport, theme-color, apple-mobile-web-app-capable |
| Service Worker | ❌ FALTA | No hay implementación |
| Vite PWA Plugin | ❌ FALTA | `vite-plugin-pwa` no instalado |
| IndexedDB / offline DB | ❌ FALTA | Sin implementación |
| Cache API | ❌ FALTA | Sin implementación |
| `localStorage` (drafts) | ✅ EXISTS | Cotizaciones en borrador persisten |
| Offline fallback | ❌ FALTA | Sin pantalla offline |

**Conclusión:** La app es instalable (PWA) pero NO funciona sin internet.

---

## PARTE 7 — CAPACITOR COMPATIBILITY ❌ NOT READY

### Bloqueantes para Capacitor

| Problema | Archivos afectados | Solución |
|---------|-------------------|---------|
| `window.location.href = url` para pagos | `billing.ts:58` | `Browser.open()` del plugin `@capacitor/browser` |
| `window.open('tel:...')` para llamadas | `Clientes.tsx`, `ClientesMobile.tsx` | `@capacitor/phone-call` o scheme `tel://` |
| `window.location.origin` en URLs | 22+ archivos | Usar `Capacitor.getPlatform()` + config base URL |
| `localStorage` (funciona pero frágil) | `draftStorage.ts` | Migrar a `@capacitor/preferences` |
| Deeplinks sin configuración nativa | `router.tsx` | Configurar `App Links` en Android + `Universal Links` en iOS |

### Lo que YA es compatible
| Elemento | Compatibilidad |
|----------|--------------|
| React Router (web router) | ✅ Funciona igual |
| Supabase JS client | ✅ Funciona igual |
| CSS + Tailwind | ✅ Funciona igual |
| React Query | ✅ Funciona igual |
| GPS (Geolocation API) | ✅ Compatible (+ plugin nativo para mejor precisión) |
| File input (cámara) | ✅ Compatible (+ `@capacitor/camera` para mejor UX) |
| MapLibre GL | ✅ Funciona en WebView |

---

## PARTE 8 — PERFORMANCE MÓVIL ⚠️ PARTIAL

### Virtualización de listas — RIESGO

| Lista | Items esperados | ¿Virtualización? | Riesgo |
|-------|----------------|-----------------|--------|
| Cotizaciones | 100-500+ | ❌ No | 🔴 Alto en gama baja |
| Clientes | 100-2000+ | ❌ No | 🔴 Alto |
| Materiales | 50-500+ | ❌ No | 🟡 Medio |
| Audit Log | 1000+ | Paginada (50/page) | ✅ OK |
| Pedidos/OTs | <100 por defecto | ❌ No | 🟢 Bajo |

### Animaciones sin `prefers-reduced-motion`
```css
/* FALTA en index.css: */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Lo que SÍ está optimizado
- CSS con `will-change` en no usados (correcto — evita memory)
- `-webkit-overflow-scrolling: touch` en carruseles móviles
- `scroll-snap` nativo en KPI carousel
- Dynamic imports (xlsx, maplibre-gl) ya implementados
- Bundle size: xlsx lazy ✅, maplibre lazy ✅

---

## PARTE 9 — ACCESIBILIDAD ❌ NOT READY (App Store requirement)

| Req. | Estado | Archivos afectados |
|------|--------|-------------------|
| `aria-label` en acciones | ⚠️ PARTIAL | Botones principales OK, tablas NO |
| Canvas accesible | ❌ FALTA | `SignatureCapture.tsx` (sin aria) |
| `prefers-reduced-motion` | ❌ FALTA | `index.css`, `plans.css` |
| Contraste de color | ✅ BIEN | Paleta Shelwi cumple WCAG AA |
| Focus management | ⚠️ PARTIAL | Modales OK, listas NO |
| Screen reader | ❌ FALTA | Sin testing |

> ⚠️ Apple App Store y Google Play requieren accesibilidad mínima WCAG 2.1 AA.

---

## CLASIFICACIÓN POR MÓDULO

| Módulo / Vista | Estado | Bloqueante |
|---------------|--------|-----------|
| Dashboard | ✅ READY | — |
| Cotizaciones | ✅ READY | Lista sin virtualizar |
| Clientes | ✅ READY | Lista sin virtualizar |
| Pipeline CRM | ✅ READY | — |
| Pedidos (PREMIUM) | ✅ READY | — |
| Órdenes de Trabajo | ✅ READY | — |
| Mapa Operativo GPS | ✅ READY | — |
| Check In / Check Out | ✅ READY | — |
| Evidencias / Fotos | ✅ READY | Video sin compresión |
| Reportes | ✅ READY | — |
| BI / Análisis | ✅ READY | — |
| Growth / Referidos | ✅ READY | — |
| Automatizaciones | ✅ READY | — |
| Customer Success | ✅ READY | — |
| Finanzas | ✅ READY | — |
| Admin Panel | ⚠️ PARTIAL | Tablas anchas en mobile |
| Pagos (Mercado Pago) | ❌ NOT READY | `window.location.href` redirect |
| Firma digital | ⚠️ PARTIAL | Sin aria-label |
| Offline mode | ❌ NOT READY | Sin Service Worker |

---

## ROADMAP PARA APP STORE

### FASE 1 — Pre-Capacitor (1-2 semanas)
**Requisitos bloqueantes antes de wrappear:**
1. Reemplazar `window.location.href` en billing.ts → `Browser.open()` o InApp browser
2. Agregar `prefers-reduced-motion` en CSS global
3. `aria-label` en `SignatureCapture` canvas
4. Deeplinks: configurar `capacitor.config.json` con URL scheme

### FASE 2 — Capacitor Setup (1 semana)
```bash
npm install @capacitor/core @capacitor/cli
npx cap init shelwi com.shelwi.app
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
```

Plugins necesarios:
- `@capacitor/browser` → pagos externos
- `@capacitor/geolocation` → GPS mejorado (reemplaza Geolocation API)
- `@capacitor/camera` → cámara nativa (mejor UX que file input)
- `@capacitor/preferences` → reemplaza localStorage
- `@capacitor/push-notifications` → notificaciones push

### FASE 3 — Performance (2 semanas)
- Virtualización con `react-window` en Cotizaciones + Clientes
- `react-intersection-observer` para lazy load de cards
- Compresión de video antes de upload

### FASE 4 — Offline PWA (3-4 semanas) — Opcional
- `vite-plugin-pwa` + Workbox para caching de assets
- IndexedDB (Dexie.js) para cache de datos críticos
- Background sync para acciones offline

### FASE 5 — App Store Submission
- TestFlight (iOS) + Internal Testing (Android)
- Accesibilidad WCAG 2.1 AA completa
- Privacy manifest (iOS 17+)
- Screenshots para Store

---

## VEREDICTO

```
La app web de Shelwi es EXCELENTE en mobile (7/10 como web app).
Para publicar en App Store se necesitan ~4-6 semanas de trabajo.
El mayor bloqueante NO es la UI (ya es mobile-first)
sino la compatibilidad con APIs nativas de Capacitor.
```

**Recomendación:** Capacitor (no React Native) — la base de código web es sólida y no tiene deuda de reescritura significativa.
