# APP STORE READINESS REPORT — SHELWI
**Fecha:** 23 de junio de 2026  
**Sprint:** 22 — Mobile Readiness

---

## RESUMEN: READY PARA CAPACITOR, PENDIENTE FIREBASE

| Categoría | Estado Sprint 22 |
|-----------|-----------------|
| Capacitor instalado | ✅ v8.4.1 |
| Plugins instalados | ✅ 8 plugins |
| window.* blockers eliminados | ✅ 12 instancias reemplazadas |
| Deep links configurados | ✅ shelwi:// + Universal Links |
| Accesibilidad base | ✅ prefers-reduced-motion + aria canvas |
| Offline First operativo | ✅ Dexie + sync queue |
| Network Manager | ✅ Hook + Banner UI |
| Push Notifications | ✅ Arquitectura lista (Firebase pendiente) |
| Virtualización listas | ✅ react-window instalado + VirtualList |
| Build TypeScript | ✅ 0 errores |

---

## CHECKLIST APP STORE (Apple)

| Requisito | Estado |
|-----------|--------|
| Icono 1024×1024 PNG | ✅ Icons en public/icons/ |
| Screenshots (6.7", 6.1", iPad) | ⏳ Pendiente (requiere build) |
| Privacy Policy URL | ✅ /politica-privacidad |
| Terms of Service | ✅ /terminos |
| Age Rating | ✅ 4+ (sin contenido adulto) |
| WCAG 2.1 Accesibilidad | ⚠️ PARCIAL (base implementada) |
| prefers-reduced-motion | ✅ Implementado |
| NSLocationWhenInUseUsageDescription | ⏳ Agregar en Info.plist |
| NSCameraUsageDescription | ⏳ Agregar en Info.plist |
| Universal Links (associated-domains) | ⏳ Configurar en Xcode |

## CHECKLIST PLAY STORE (Google)

| Requisito | Estado |
|-----------|--------|
| App Signing (keystore) | ⏳ Pendiente (requiere build) |
| Target SDK 34+ | ⏳ Verificar en build.gradle |
| App Links (Digital Asset Links) | ⏳ Configurar assetlinks.json |
| ACCESS_COARSE_LOCATION permission | ⏳ Agregar en AndroidManifest |
| CAMERA permission | ⏳ Agregar en AndroidManifest |
| Privacy Policy | ✅ |
| Screenshots (phone + tablet) | ⏳ Pendiente (requiere build) |

---

## ARCHIVOS CREADOS EN SPRINT 22

| Archivo | Propósito |
|---------|-----------|
| `capacitor.config.ts` | Configuración de Capacitor + plugins |
| `src/lib/capacitorBridge.ts` | Abstracción web/native unificada |
| `src/lib/deepLinks.ts` | Deep links + URL scheme handler |
| `src/lib/offlineDB.ts` | Dexie + schema offline (sync queue, evidences, GPS) |
| `src/services/offlineSync.ts` | Motor de sincronización offline → backend |
| `src/services/pushNotifications.ts` | Tipos + abstracciones push (Firebase pendiente) |
| `src/hooks/useNetworkStatus.ts` | Network state + trigger sync |
| `src/components/ui/NetworkBanner.tsx` | Indicador visual offline/pending |
| `src/components/ui/VirtualList.tsx` | Lista virtualizada con react-window |

---

## PRÓXIMOS PASOS PARA PUBLICAR

```
1. npx cap add ios
2. npx cap add android
3. Configurar Info.plist (iOS permissions + Universal Links)
4. Configurar AndroidManifest.xml (permissions + App Links)
5. npx cap sync
6. Abrir Xcode / Android Studio
7. Configurar bundle ID, signing, versión
8. Screenshots en simulador
9. Integrar Firebase (FCM) para push
10. Submit a TestFlight / Google Internal Testing
```
