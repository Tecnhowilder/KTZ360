# ONBOARDING FIX REPORT
**Fecha:** 23 de junio de 2026  
**Correcciones:** C1 (Email confirmation) + C2 (Role-based onboarding)

---

## CORRECCIÓN 1 — Pantalla de confirmación de email

### Problema
Cuando un usuario se registraba con `mailer_autoconfirm = false` (producción actual), la app navegaba silenciosamente a `/login` sin ningún mensaje. El usuario no sabía que debía confirmar su email.

### Archivos modificados

#### `src/services/auth.ts`
Funciones añadidas:
- `resendConfirmationEmail(email)` — llama a `supabase.auth.resend({ type: 'signup', email })`
- `getResendCooldownRemaining()` — retorna ms restantes del cooldown (localStorage)
- `markResendSent()` — registra timestamp del último reenvío
- `RESEND_COOLDOWN_KEY` — clave localStorage para el cooldown
- `RESEND_COOLDOWN_MS` — 60.000ms (60 segundos entre reenvíos)

#### `src/features/auth/RegisterPage.tsx`
Componente `ConfirmEmailScreen` añadido con:
- ✅ Pantalla dedicada (no toast, no modal)
- ✅ Muestra el email utilizado
- ✅ Botón "Reenviar correo" con cooldown de 60s
- ✅ Countdown en tiempo real (1s interval)
- ✅ Rate limiting client-side + Supabase built-in rate limit
- ✅ Estado de éxito al reenviar
- ✅ Estado de error al reenviar
- ✅ Botón "Usar otro correo" (vuelve al formulario)
- ✅ Botón "Ya confirmé → Iniciar sesión"
- ✅ Mensaje sobre carpeta spam

Flujo actualizado en `RegisterPage`:
```
signUp() → session === null
  → Estado: pendingConfirmation = true
  → Muestra ConfirmEmailScreen (NO navega a /login)
  → cooldown iniciado automáticamente desde el registro
```

### Rate limiting implementado
| Nivel | Mecanismo | Límite |
|-------|----------|--------|
| Client-side | localStorage timestamp | 1 reenvío / 60 segundos |
| Supabase built-in | Auth rate limits | 2 emails / hora por email |

---

## CORRECCIÓN 2 — Onboarding diferenciado por rol

### Problema
Todos los roles (owner, admin, employee, supervisor, comercial, operario) veían las mismas 3 slides del onboarding de owner. Un empleado invitado veía contenido irrelevante sobre configurar la empresa.

### Archivos creados/modificados

#### `src/lib/roleOnboarding.ts` — NUEVO (fuente única de verdad)
- `ROLE_SLIDES` — objeto con slides específicos por rol
- `getSlidesForRole(role)` — retorna slides para el rol dado
- `shouldSkipOnboarding(role)` — true para super_admin y support_admin
- `SKIP_ONBOARDING_ROLES` — ['super_admin', 'support_admin']

#### `src/views/OnboardingPage.tsx` — ACTUALIZADO
- Lee el rol del usuario desde Supabase auth + profiles al montar
- Selecciona slides dinámicamente según el rol
- Si el rol requiere skip → `completeOnboarding()` + redirect inmediato
- Fallback a slides de 'owner' si no hay sesión o error

#### `src/features/auth/ProtectedRoute.tsx` — ACTUALIZADO
- Importa `shouldSkipOnboarding` desde `roleOnboarding.ts`
- `WorkspaceGate`: si el rol es `super_admin` o `support_admin`, no redirige a onboarding

---

## ROLES SOPORTADOS

| Rol | Slides | Enfoque | Skip |
|-----|--------|---------|------|
| `owner` | 3 slides (original) | Configurar y gestionar empresa | ❌ |
| `admin` | 3 slides nuevas | Gestión operativa y reportes | ❌ |
| `employee` | 3 slides nuevas | OTs, evidencias, equipo | ❌ |
| `supervisor` | 3 slides nuevas | Supervisión, GPS, productividad | ❌ |
| `comercial` | 3 slides nuevas | Pipeline, cotizaciones, IA | ❌ |
| `operario` | 3 slides nuevas | Tareas, check-in/out, evidencias | ❌ |
| `super_admin` | — | Skip automático | ✅ |
| `support_admin` | — | Skip automático | ✅ |

### Contenido de slides por rol

**OWNER** (existente, sin cambios):
1. Crea cotizaciones profesionales
2. Organiza y gestiona todo en un solo lugar
3. Recibe notificaciones y nunca pierdas el control

**ADMIN:**
1. Gestiona el equipo y las operaciones
2. Cotizaciones y pipeline comercial
3. Reportes y métricas en tiempo real

**EMPLOYEE:**
1. Tus tareas asignadas en un solo lugar
2. Registra evidencias y avances
3. Conectado con tu equipo en todo momento

**SUPERVISOR:**
1. Supervisa tu equipo en tiempo real
2. Órdenes de trabajo y productividad
3. Alertas y control de calidad

**COMERCIAL:**
1. Tu pipeline comercial, siempre claro
2. Crea cotizaciones que cierran
3. IA para vender más

**OPERARIO:**
1. Tus órdenes de trabajo del día
2. Check in / Check out en cada OT
3. Evidencias en tiempo real

---

## ARQUITECTURA DEL SISTEMA

```
Nuevo usuario se registra
       ↓
handle_new_user() crea profile con onboarding_seen = false
       ↓
Usuario confirma email → sesión activa
       ↓
WorkspaceGate verifica:
  ├─ shouldSkipOnboarding(role)?  → NO redirigir [super_admin/support_admin]
  ├─ onboarding_seen = false AND localStorage empty? → /onboarding
  └─ onboarding_seen = true OR localStorage 'true'? → app normal

En /onboarding:
  ├─ Carga role desde profiles
  ├─ getSlidesForRole(role) → slides específicos
  ├─ shouldSkipOnboarding → completeOnboarding() + redirect
  └─ Muestra slides del rol → completeOnboarding() al terminar
```

---

## VALIDACIONES

| Prueba | Estado |
|--------|--------|
| 1. Registro muestra pantalla de confirmación | ✅ PASS — cuando `session === null` |
| 2. Reenvío de correo funciona con cooldown | ✅ PASS — 60s cooldown implementado |
| 3. Owner ve onboarding correcto (3 slides originales) | ✅ PASS |
| 4. Admin ve onboarding de gestión operativa | ✅ PASS |
| 5. Employee ve onboarding de campo | ✅ PASS |
| 6. Supervisor ve onboarding de supervisión | ✅ PASS |
| 7. Comercial ve onboarding de pipeline | ✅ PASS |
| 8. Operario ve onboarding de tareas de campo | ✅ PASS |
| 9. super_admin salta onboarding | ✅ PASS — `shouldSkipOnboarding` en WorkspaceGate |
| 10. Build TypeScript 0 errores | ✅ PASS |
| 11. Zero Trust intacto | ✅ PASS — role viene de DB, no del frontend |
| 12. Multi Tenant intacto | ✅ PASS — profile.role es per-workspace |

---

## RIESGOS DETECTADOS

| # | Riesgo | Severidad | Estado |
|---|--------|-----------|--------|
| 1 | Si Supabase cambia la API de `resend()`, el reenvío fallará | 🟢 Bajo | Monitorear en upgrades |
| 2 | Imágenes de onboarding son las mismas para todos los roles | 🟡 Medio | Agregar imágenes específicas por rol en Sprint siguiente |
| 3 | Rate limit de Supabase (2 emails/hora) puede frustrar usuarios con spam | 🟡 Medio | Comunicado en pantalla con mensaje de spam |
| 4 | Si `profile.role` no está en la whitelist de `getSlidesForRole`, muestra slides de 'employee' | 🟢 Bajo | Fallback seguro |

---

## PENDIENTE PARA SPRINTS FUTUROS

- Imágenes específicas por rol (actualmente reutilizan las 3 imágenes de owner)
- Onboarding interactivo con steps accionables (no solo informativo)
- Tracking de cuántos usuarios completan el onboarding vs lo omiten
- Personalización del texto con el nombre del usuario (`Hola, {nombre}`)
