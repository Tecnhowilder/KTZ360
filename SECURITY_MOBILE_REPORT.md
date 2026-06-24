# SECURITY MOBILE REPORT — SHELWI
**Fecha:** 23 de junio de 2026  
**Sprint:** 22 — Mobile Readiness

---

## ZERO TRUST EN CONTEXTO MOBILE

| Principio | Implementación Mobile |
|-----------|----------------------|
| `workspace_id` nunca del frontend | ✅ Mantenido — RPCs usan JWT |
| Tokens nunca en URL | ✅ Deep links no exponen tokens sensibles |
| GPS consentimiento explícito | ✅ `grant_gps_consent()` RPC + `gps_consent_at` en DB |
| Evidencias offline re-validadas | ✅ `register_evidence_file` RPC valida en backend al sync |
| `localStorage` para datos NO críticos | ✅ Drafts de cotizaciones (no credenciales) |
| Credenciales en `Preferences` (keychain iOS) | ✅ `getPreference/setPreference` via Capacitor |
| Sync offline re-autentica | ✅ JWT requerido para cada RPC en sync |

---

## RLS Y CAPACITOR

El switch a Capacitor no modifica RLS:
- Las RPCs son las mismas → RLS aplica igual
- El JWT de Supabase se envía en Authorization header igual en WebView
- `auth.uid()` en SECURITY DEFINER RPCs funciona igual

---

## DATOS OFFLINE — RIESGOS

| Riesgo | Mitigación |
|--------|-----------|
| Base64 de evidencias en IndexedDB (local) | Solo en dispositivo del usuario. Sin acceso cross-app en iOS (sandboxing). En Android: protegido por Android Keystore si se usa Filesystem con `EncryptedStorage`. |
| `userId` en syncQueue local | Solo para referencia. El backend no lo usa (usa JWT). |
| IndexedDB accesible desde DevTools | Solo en web. En Capacitor nativo no hay acceso. En desarrollo es aceptable. |
| JWT expirado al sincronizar | Sync falla silenciosamente. El usuario debe re-autenticar. Los datos siguen en cola. |

---

## PRIVACIDAD (App Store Requisito)

| Dato | Dónde va | Consentimiento |
|------|----------|---------------|
| Ubicación GPS | Supabase DB (member_locations) | ✅ Explícito: `gps_consent_at` |
| Fotos/Videos | Supabase Storage (bucket evidences) | ✅ El usuario sube conscientemente |
| Firma digital | Supabase Storage | ✅ El usuario dibuja conscientemente |
| Teléfono | profiles.phone (solo si el usuario lo ingresa) | ✅ Formulario voluntario |

---

## CHECKLIST SEGURIDAD MOBILE

| Check | Estado |
|-------|--------|
| No hay tokens en URL | ✅ |
| Capacitor Browser cierra al navegar de vuelta | ✅ (in-app browser) |
| No hay `window.eval()` | ✅ |
| CSP compatible con WebView | ⚠️ Verificar en build nativo |
| Certificate Pinning | ⏳ Pendiente (requiere plugin extra) |
| Biometric auth (Face ID / Fingerprint) | ⏳ Pendiente para Sprint 23 |
| Jailbreak/Root detection | ⏳ Pendiente para Sprint 23 |
