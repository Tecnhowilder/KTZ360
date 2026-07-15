# BRANCH STRATEGY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Estrategia de ramas Git para el desarrollo de Shelwi

---

## 1. ESTRUCTURA DE RAMAS

```
main          ← Producción. Solo recibe merges de release o hotfix.
  └── develop ← Integración de features. Base para todos los feature branches.
        └── feature/FASE-N-descripcion  ← Features nuevas
        └── fix/descripcion             ← Bug fixes no urgentes
        └── docs/descripcion            ← Cambios solo de documentación
        └── refactor/descripcion        ← Refactors sin cambio de comportamiento
  └── hotfix/descripcion               ← Fixes urgentes de producción (desde main)
```

---

## 2. RAMAS PERMANENTES

### main
- Representa el estado actual de **producción**
- Nunca se hace push directo a `main`
- Solo recibe merges mediante Pull Request desde `release/x.x.x` o `hotfix/`
- Toda merge a `main` debe tener un tag de versión semver: `v1.5.0`
- **Protegida:** require PR + review

### develop
- Rama de integración continua
- Recibe merges de todos los feature branches
- Debe mantenerse en estado "deployable a staging" siempre
- **Protegida:** require PR

---

## 3. RAMAS TEMPORALES

### feature/
```
Formato: feature/FASE-N-descripcion-corta
Ejemplos:
  feature/FASE-2-dashboard-executive
  feature/FASE-3-ai-studio-v2
  feature/FASE-4-offline-sync

Desde: develop
Hacia: develop (via PR)
Vida: hasta que el feature sea mergeado
```

### fix/
```
Formato: fix/descripcion-del-bug
Ejemplos:
  fix/quote-total-calculation
  fix/gps-checkin-offline

Desde: develop
Hacia: develop (via PR)
```

### hotfix/
```
Formato: hotfix/descripcion-urgente
Ejemplos:
  hotfix/mp-webhook-signature-validation
  hotfix/rls-bypass-invoices

Desde: main
Hacia: main Y develop (dos PRs)
Uso: solo para bugs críticos en producción que no pueden esperar el próximo release
```

### docs/
```
Formato: docs/descripcion
Ejemplos:
  docs/update-architecture-baseline
  docs/add-adr-015

Desde: develop (o main si son cambios de documentación sin código)
Hacia: develop
No requiere review técnico de código
```

---

## 4. COMMITS

### 4.1 Conventional Commits (recomendado)

```
<tipo>(<scope>): <descripción>

Tipos:
  feat     — nueva funcionalidad
  fix      — bug fix
  docs     — cambios de documentación
  refactor — refactor sin cambio de comportamiento
  test     — agregar o modificar tests
  chore    — tareas de mantenimiento (deps, config)
  perf     — mejoras de performance
  security — fix de seguridad

Ejemplos:
  feat(crm): add bulk client import from CSV
  fix(finance): correct invoice total when tax_percent is 0
  security(auth): validate workspace_id from DB in ai-proxy
  docs(architecture): update EPMO v2 with sprint 14 plan
```

### 4.2 Tamaño de commits

- Commits atómicos: un commit = una cosa
- No mezclar refactor con feature en el mismo commit
- Los commits de docs pueden agrupar múltiples archivos

---

## 5. PULL REQUESTS

### Template de PR
```markdown
## Qué cambia
[Descripción concisa de los cambios]

## Por qué
[Contexto y motivación]

## Testing
- [ ] Probado en development local
- [ ] Smoke test en staging
- [ ] Sin regresiones visibles en módulos relacionados

## Checklist de seguridad
- [ ] No hay secrets hardcodeados
- [ ] Multi-tenancy respetado (company_id en queries)
- [ ] Feature access vía useFeatureAccess() (no plan hardcodeado)
- [ ] Zero Trust en Edge Functions (workspace_id de DB)
```

### Reglas
- Mínimo 1 reviewer para merges a `develop`
- Mínimo 2 reviewers para merges a `main`
- Self-merge solo en docs/ y chore/ si no hay reviewers disponibles
- PR descriptions en español (código y variables en inglés)

---

## 6. TAGS Y VERSIONES

```bash
# Al hacer release a producción
git tag -a v1.5.0 -m "Release v1.5.0: Dashboard ejecutivo + AI Studio v2"
git push origin v1.5.0
```

Seguimos **Semantic Versioning (semver):**
- MAJOR (X.0.0): cambio de arquitectura mayor, breaking changes
- MINOR (1.X.0): nueva feature, sprint completado
- PATCH (1.5.X): bug fix, hotfix

---

*Ver: `docs/27_RELEASE_STRATEGY.md` para el proceso de release*
*Ver: `docs/28_CICD_PIPELINE.md` para CI/CD*
