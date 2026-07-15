# CI/CD PIPELINE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Pipeline de integración y entrega continua
> Estado actual: CI/CD parcialmente manual — automatización en roadmap

---

## 1. ESTADO ACTUAL (Baseline v1.0)

Shelwi no tiene CI/CD completamente automatizado aún. Este documento describe el estado actual y la arquitectura objetivo.

| Paso | Estado actual | Estado objetivo |
|---|---|---|
| Type check (`tsc --noEmit`) | Manual | Automático en PR |
| Lint (`eslint`) | Manual | Automático en PR |
| Tests unitarios | No configurados | Automático en PR |
| Deploy Edge Functions | Manual (`supabase functions deploy`) | Automático en merge a develop/main |
| Deploy frontend | Manual o via hosting provider | Automático en merge |
| Migrations | Manual (`supabase db push`) | Semi-automático (requiere confirmación) |
| Smoke tests | Manual | Automático post-deploy |

---

## 2. COMANDOS ACTUALES (workflow manual)

### 2.1 Verificación local antes de PR

```bash
# Type checking
npx tsc --noEmit

# Build (verificar que compila sin errores)
npm run build

# Si hay tests configurados
npm test
```

### 2.2 Deploy de Edge Functions

```bash
# Deploy función específica
supabase functions deploy ai-proxy --project-ref $PROJECT_REF

# Deploy todas las funciones
supabase functions deploy --project-ref $PROJECT_REF

# Ver logs post-deploy
supabase functions logs ai-proxy --project-ref $PROJECT_REF
```

### 2.3 Aplicar migraciones

```bash
# Verificar estado de migraciones
supabase db diff --db-url $DATABASE_URL

# Aplicar en staging
supabase db push --db-url $STAGING_DB_URL

# Aplicar en producción (con confirmación manual)
supabase db push --db-url $PRODUCTION_DB_URL
```

---

## 3. ARQUITECTURA OBJETIVO CI/CD

```yaml
# .github/workflows/ci.yml (objetivo)

name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx tsc --noEmit

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test

  build:
    needs: [typecheck, lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
```

```yaml
# .github/workflows/deploy-staging.yml (objetivo)

name: Deploy to Staging

on:
  push:
    branches: [develop]

jobs:
  deploy-functions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase functions deploy --project-ref ${{ secrets.STAGING_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: # deploy a hosting provider
```

---

## 4. SECRETS REQUERIDOS (para CI/CD cuando se implemente)

| Secret | Descripción | Dónde configurar |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token CLI de Supabase | GitHub Secrets |
| `STAGING_PROJECT_REF` | ID del proyecto staging | GitHub Secrets |
| `PRODUCTION_PROJECT_REF` | ID del proyecto producción | GitHub Secrets |
| `STAGING_DB_URL` | URL directa a DB de staging | GitHub Secrets |
| Variables de Edge Functions | Todos los API keys | Supabase Secrets (no GitHub) |

**IMPORTANTE:** Los API keys de Gemini, NVIDIA, MercadoPago, etc. NO se guardan en GitHub Secrets — se configuran directamente en Supabase via `supabase secrets set`.

---

## 5. SMOKE TEST POST-DEPLOY

Script de verificación manual hasta automatizar:

```bash
# 1. Frontend carga
curl -I https://app.shelwi.com/  # HTTP 200

# 2. Supabase responde
curl -I $SUPABASE_URL/rest/v1/  # HTTP 200

# 3. Edge Functions responden
curl -X GET $SUPABASE_URL/functions/v1/ai-health-check \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"  # HTTP 200

# 4. Autenticación funciona
# [test manual: login con cuenta de prueba]

# 5. Operación básica funciona
# [test manual: crear cliente de prueba]
```

---

## 6. DEUDA TÉCNICA CI/CD (TD-CI-01)

| Item | Prioridad | Sprint objetivo |
|---|---|---|
| Configurar GitHub Actions con typecheck + lint | P1 | FASE 2 |
| Tests unitarios con Vitest | P1 | FASE 2 |
| Auto-deploy a staging en push a develop | P2 | FASE 3 |
| Smoke tests automatizados post-deploy | P2 | FASE 3 |
| Auto-deploy a producción (con aprobación manual) | P3 | FASE 5 |
| E2E tests con Playwright | P3 | FASE 6 |

---

*Ver: `docs/26_BRANCH_STRATEGY.md` para el flujo de ramas*
*Ver: `docs/29_TESTING_STRATEGY.md` para estrategia de tests*
*Ver: `docs/27_RELEASE_STRATEGY.md` para el proceso de release*
