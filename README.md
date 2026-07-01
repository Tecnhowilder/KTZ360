# Shelwi — Plataforma de Operaciones para PYMEs

SaaS multi-tenant para gestión de cotizaciones, pedidos, equipo en campo y automatizaciones con IA.

**Stack**: React 19 + TypeScript + Vite · Supabase (Postgres + RLS + Edge Functions) · Capacitor (iOS/Android) · TanStack Query

---

## Inicio rápido

```bash
npm install
npm run dev        # servidor de desarrollo (Vite)
npm run build      # typecheck + build de producción
npm run lint       # ESLint
npm test           # Vitest
```

## Arquitectura

- **Frontend**: React SPA con routing via react-router-dom v7. Navegación dual Desktop/Mobile.
- **Backend**: 100% Supabase — Postgres con RLS + RPC (PL/pgSQL) + 11 Edge Functions (Deno).
- **Auth**: Supabase Auth + `WorkspaceProvider` (multi-tenant con isolación via JWT).
- **Mobile**: Capacitor para empaquetado nativo iOS/Android.
- **IA**: Agente operativo Shelwi con créditos por operación, proxy via Edge Function.

## Estructura del proyecto

```
src/
  features/auth/    ← AuthProvider, WorkspaceProvider, ProtectedRoute
  features/app/     ← UIProvider (estado global UI)
  views/            ← Páginas completas (Desktop + Mobile)
  components/       ← Componentes reutilizables
  hooks/            ← Lógica de datos (TanStack Query sobre services/)
  services/         ← Acceso a Supabase por dominio
  lib/              ← Utilidades, tipos, motor de cálculo

supabase/
  migrations/       ← 133 migraciones SQL (0001 → 0123)
  functions/        ← 11 Edge Functions (Deno)
  seeds/            ← Seeds de datos iniciales
  qa/               ← Scripts de testing/QA (NO ejecutar en prod)
  scripts/          ← Herramientas de auditoría y admin
  migration_registry.md   ← Registro de reservas por sprint
```

## Documentación

| Carpeta | Contenido |
|---|---|
| [docs/architecture/](docs/architecture/) | Arquitectura, IA, escalabilidad, rendimiento, mobile/capacitor |
| [docs/security/](docs/security/) | Auditorías de seguridad, RLS, hardening, sesiones |
| [docs/roadmap/](docs/roadmap/) | Roadmaps por sprint (1–15+), planes de implementación |
| [docs/audits/](docs/audits/) | Auditorías funcionales, hotfixes, reportes de sprint |
| [docs/database/](docs/database/) | Gobernanza de migraciones SQL |
| [docs/adr/](docs/adr/) | Architecture Decision Records |
| [docs/api/](docs/api/) | Edge Functions y RPCs |
| [MIGRATION_GOVERNANCE.md](docs/database/MIGRATION_GOVERNANCE.md) | Reglas oficiales de migraciones |

## Gobernanza de migraciones

- Próximo número libre: **0124**
- Huecos históricos (no reutilizar): 0028, 0121
- Ver: [supabase/migration_registry.md](supabase/migration_registry.md)
- Validar: `./scripts/check-migrations.sh`

## Variables de entorno

Copiar `.env.example` → `.env.local`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
