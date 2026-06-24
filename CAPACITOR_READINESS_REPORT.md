# CAPACITOR READINESS REPORT — SHELWI
**Fecha:** 23 de junio de 2026

---

## VERSIÓN INSTALADA

```
@capacitor/core:               8.4.1
@capacitor/cli:                8.x (devDependency)
@capacitor/app:                8.x
@capacitor/browser:            8.x
@capacitor/camera:             8.x
@capacitor/geolocation:        8.x
@capacitor/preferences:        8.x
@capacitor/network:            8.x
@capacitor/push-notifications: 8.x
@capacitor/filesystem:         8.x
```

---

## BLOCKERS ELIMINADOS (12 instancias)

| Archivo | Antes | Después |
|---------|-------|---------|
| `billing.ts:58` | `window.location.href = initPoint` | `navigateToUrl(initPoint)` |
| `useIntegrations.ts:29` | `window.location.href = authUrl` | `navigateToUrl(authUrl)` |
| `whatsapp.ts` (3x) | `window.open(wa.me/...)` | `openExternalUrl(url)` |
| `shareUtils.ts` (2x) | `window.open(wa.me/...)` + `window.open(mailto:...)` | `openExternalUrl` + `openEmail` |
| `ClientesMobile.tsx` (4x) | `window.open(tel:...)` + `window.open(wa.me/...)` | `openPhone()` + `openExternalUrl()` |
| `CotizacionesMobile.tsx` (2x) | `window.open(tel:...)` + `window.open(wa.me/...)` | `openPhone()` + `openExternalUrl()` |
| `Clientes.tsx:264` | `window.open(tel:...)` | `openPhone()` |
| `MaterialesMobile.tsx:131` | `window.open(wa.me/...)` | `openExternalUrl()` |
| `LoginPage.tsx:72` | `window.location.origin` (OAuth redirectTo) | `getAppBaseUrl()` |
| `auth.ts:31` | `window.location.origin` (recovery redirectTo) | `DeepLinks.resetPassword()` |

---

## CAPACITOR BRIDGE (src/lib/capacitorBridge.ts)

| Función | Web | Native |
|---------|-----|--------|
| `openExternalUrl(url)` | `window.open(url, '_blank')` | `Browser.open({url})` |
| `navigateToUrl(url)` | `window.location.href = url` | `Browser.open({url})` |
| `openPhone(phone)` | `window.open(tel:phone)` | `Browser.open({url: 'tel:...'})` |
| `openWhatsApp(phone, msg?)` | `window.open(wa.me/...)` | `Browser.open(...)` |
| `openEmail(email, subject?, body?)` | `window.open(mailto:...)` | `Browser.open(...)` |
| `getCurrentGpsPosition()` | `navigator.geolocation` | `Geolocation.getCurrentPosition()` |
| `setPreference(key, value)` | `localStorage.setItem()` | `Preferences.set()` |
| `getPreference(key)` | `localStorage.getItem()` | `Preferences.get()` |
| `getNetworkStatus()` | `navigator.onLine` | `Network.getStatus()` |
| `saveFileOffline(name, base64)` | Lanza error | `Filesystem.writeFile()` |
| `readFileOffline(path)` | Lanza error | `Filesystem.readFile()` |
| `getAppBaseUrl()` | `window.location.origin` | `'https://app.shelwi.com'` |
| `isNative` | `false` | `true` |
| `isIOS` | `false` | `true` en iOS |
| `isAndroid` | `false` | `true` en Android |

---

## DEEP LINKS CONFIGURADOS (src/lib/deepLinks.ts)

| Route | Web URL | Native URL |
|-------|---------|-----------|
| Portal cotización | `https://app.shelwi.com/p/:token` | `shelwi://p/:token` |
| Portal cliente | `https://app.shelwi.com/portal/:token` | `shelwi://portal/:token` |
| Invitación | `https://app.shelwi.com/invite/:token` | `shelwi://invite/:token` |
| Reset password | `https://app.shelwi.com/recuperar-contrasena` | `https://app.shelwi.com/recuperar-contrasena` |
| Dashboard | `https://app.shelwi.com/app/dashboard` | `shelwi://app/dashboard` |
| Detalle Pedido | `https://app.shelwi.com/app/pedidos/:id` | `shelwi://app/pedidos/:id` |
| Detalle OT | `https://app.shelwi.com/app/ordenes-trabajo/:id` | `shelwi://app/ordenes-trabajo/:id` |

---

## PARA ACTIVAR CAPACITOR BUILDS

```bash
# 1. Inicializar plataformas (NO ejecutar hasta tener .env configurado para prod)
npx cap add ios
npx cap add android

# 2. Sincronizar código web compilado
npm run build
npx cap sync

# 3. Abrir en IDE nativo
npx cap open ios      # Xcode
npx cap open android  # Android Studio
```
