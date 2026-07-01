# ROADMAP DE CONSOLIDACIÓN — SHELWI

**Fecha:** 2026-06-22  
**Base:** Auditoría global Sprint 1 → Sprint 16  
**Propósito:** Preparar para producción real, Sprint 17 Growth y Sprint 18 Enterprise.

---

## 1. CORRECCIONES OBLIGATORIAS ANTES DE PRODUCCIÓN

Estas deben resolverse antes de exponer la plataforma a clientes reales.

| Prioridad | Hallazgo | Acción | Impacto si no se corrige |
|---|---|---|---|
| 🔴 P1 | `BRI-` en numeración de cotizaciones | Migración: cambiar prefijo a `SHW-` o hacerlo configurable por workspace | Cada cotización muestra marca anterior "Brivia" |
| 🔴 P2 | Archivos seed en migraciones de producción | Mover `0021_seed_*`, `0023_*`, `0024_*` a directorio `seeds/` separado | Datos falsos en workspaces productivos |
| 🔴 P3 | GPS frontend inexistente | Integrar `CheckInOutButton`, `OperationalMap` en Team view y Mobile | Feature PREMIUM pagada que no se puede usar |
| 🔴 P4 | `automation_enabled` no tipado en PlanFeaturesRow | Agregar a `database.types.ts` | `useFeatureAccess('automation_enabled')` retorna undefined |
| 🔴 P5 | `loyalty_enabled`, `portal_show_reviews`, `portal_show_loyalty` no tipados | Agregar a `CompanySettingsRow` en `database.types.ts` | Campos Sprint 16 invisibles para TypeScript |

---

## 2. MEJORAS RECOMENDADAS (Sprint de Consolidación)

Implementar antes de Sprint 17 para solidificar la base.

### 2.1 Frontend

| Mejora | Justificación |
|---|---|
| Unificar WhatsApp en `services/whatsapp.ts` | Eliminar `openWhats()`/`followMessage()` de calc.ts y `openWhatsAppShare()` de shareUtils.ts. Un solo camino backend-first. |
| Crear hooks `useReviews`, `useSurveys`, `useLoyalty` | Las vistas llaman servicios directamente en lugar de React Query — anti-patrón que dificulta caché e invalidación. |
| Migrar Desktop de Reportes a RPCs backend | El sprint 5 migró solo mobile. Desktop sigue con cálculos en frontend — viola Zero Trust. |
| Renombrar `KtzIA.tsx` → `ShelwiIA.tsx` | Deuda cosmética que confunde a nuevos desarrolladores. |
| Implementar `/app/proyectos` o eliminar la ruta | La ruta existe pero muestra `SimpleEmpty`. Se prometió en Sprint 1. Decidir: implementar o eliminar. |
| Implementar Configuración Desktop | `ConfiguracionPage` muestra `SimpleEmpty` en desktop. Inconsistente con la UI móvil. |

### 2.2 Backend

| Mejora | Justificación |
|---|---|
| Crear CMS para Loyalty/Reviews/Surveys | Backend de Sprint 16 listo. Sin UI de admin, el owner no puede configurar su programa. |
| Agregar retención a `portal_access_log` | La tabla crece indefinidamente. Agregar al cleanup del scheduler (90 días). |
| Indexar `client_portal_tokens.revoked_at` | Query `WHERE revoked_at IS NULL` sin índice parcial. Lento con tokens revocados. |
| Consolidar triggers de quotes | `trg_quotes_timeline_on_status` + `trg_quotes_automation_dispatch` — un solo trigger multi-propósito. |
| Corregir `get_public_quote()` en `oauth-callback` — usar state para detectar provider | El provider viene de query param, debe venir del state validado. |

### 2.3 Tipos TypeScript

| Corrección | Detalle |
|---|---|
| `PlanFeaturesRow` + `automation_enabled` | Campo presente en DB pero ausente en el type |
| `CompanySettingsRow` + loyalty/reviews/surveys fields | 3 campos Sprint 16 ausentes |
| `PlanLimitsRow` + `automation_ai_credits_pct` | Campo presente en DB pero ausente |

---

## 3. REFACTORS RECOMENDADOS

Para la health a largo plazo de la codebase.

### 3.1 Consolidar WhatsApp (1 sprint pequeño)

```
ANTES:
  lib/calc.ts → openWhats(), followMessage()
  lib/shareUtils.ts → openWhatsAppShare() (@deprecated)
  services/whatsapp.ts → getWhatsAppMessage() [correcto]

DESPUÉS:
  services/whatsapp.ts → ÚNICA fuente de verdad
  Todo el frontend llama services/whatsapp.ts
```

### 3.2 Normalizar eventos en triggers de quotes

```
ANTES:
  trg_quotes_timeline_on_status    → cliente_timeline_events
  trg_quotes_automation_dispatch   → evaluate_and_queue_automations
  [ambos en UPDATE OF status]

DESPUÉS:
  trg_quotes_dispatch (único)
  → registra en client_timeline_events
  → llama evaluate_and_queue_automations
```

### 3.3 Integrar GPS en Team view

```
COMPONENTES CREADOS (Sprint 8) — sin usar:
  CheckInOutButton.tsx
  OperationalMap.tsx
  MemberDetailSheet.tsx
  OperationalStatusSelector.tsx

INTEGRACIÓN NECESARIA:
  Team.tsx → pestaña "GPS" con OperationalMap
  OTDetailPage.tsx → CheckInOutButton para operarios
  MobileBottomNav → acceso a estado operativo
```

---

## 4. FUNCIONALIDADES CANDIDATAS A ELIMINACIÓN/ARCHIVADO

| Elemento | Estado | Recomendación |
|---|---|---|
| `leads` tabla | Sin uso desde Sprint 1 | Archivar (mantener en schema, documentar como "Sprint 17 leads pipeline") |
| `projects` tabla | Sin uso desde Sprint 1 | Igual que leads — reservado para Sprint 18 |
| `workspace_features` tabla | Reemplazada por `plan_features` | Deprecar: agregar comment, no consultar más desde frontend |
| `service_materials` tabla | Sin uso | Reservar para futuro motor de cotización por materiales |
| `attachments` bucket+tabla | Reemplazada por `evidences` | Documentar como legacy. No aceptar nuevos uploads. |
| `/app/proyectos` ruta + SimpleEmpty | Stub desde Sprint 1 | Decidir: implementar en Sprint 18 o eliminar la ruta |

---

## 5. DEUDA TÉCNICA ACUMULADA (CLASIFICADA)

### Deuda Crítica (bloquea producción)

1. Prefijo `BRI-` en quotes — **Sprint 1**
2. Seed data en migraciones — **Sprint 1**
3. GPS UI inexistente a pesar de backend completo — **Sprint 8**
4. Tipos TypeScript desincronizados con DB — **Sprints 13 y 16**

### Deuda Alta (degrada calidad)

5. WhatsApp 3 implementaciones paralelas — **Sprints 1, 11**
6. Desktop de Reportes no Zero Trust — **Sprint 5**
7. Hooks faltantes para Reviews/Surveys/Loyalty — **Sprint 16**
8. CMS incompleto para nuevas funcionalidades — **Sprint 16**

### Deuda Media (cosmética o de escalabilidad futura)

9. `KtzIA.tsx` nombre legacy — **Sprint 2**
10. `workspace_features` tabla zombie — **Sprint 1**
11. `portal_access_log` sin retención — **Sprint 10**
12. Triggers duplicados en quotes — **Sprints 4 y 13**
13. OAuth provider desde query param, no desde state — **Sprint 11**

### Deuda Baja (puede esperar)

14. `leads` y `projects` sin uso — **Sprint 1**
15. `service_materials` sin uso — **Sprint 1**
16. `attachments` bucket legacy — **Sprint 7**
17. `/app/proyectos` stub — **Sprint 1**

---

## 6. ESTADO GENERAL DE LA PLATAFORMA

```
PRODUCCIÓN: ⚠️ NO LISTA (5 correcciones críticas pendientes)
ESCALABILIDAD: ✅ Arquitectura multi-tenant correcta
SEGURIDAD: ✅ Zero Trust en backend — ⚠️ 3 RLS con check(true) aceptables
DEUDA TÉCNICA: 🟡 Manejable (17 items, 4 críticos)
FUNCIONALIDADES: ✅ 16 sprints completados
```

### Métricas de la plataforma

- **78 migraciones SQL** aplicadas (o pendientes)
- **54 tablas** en el schema público
- **~93 RPCs** (estimado desde database.types.ts)
- **10 Edge Functions**
- **37 servicios TypeScript**
- **18 hooks React Query**
- **67 componentes**
- **25 vistas**
- **16 sprints** completados

---

## 7. PLAN RECOMENDADO PARA SPRINT 17

Dado el estado de la auditoría, se recomienda que **Sprint 17 sea un sprint mixto**: 50% consolidación + 50% nuevas funcionalidades de Growth.

### Sprint 17 — Consolidación + Growth

**Consolidación (50%):**
- [ ] Fix: prefijo `BRI-` → `SHW-` en quotes
- [ ] Fix: tipos TypeScript desincronizados (3 correcciones)
- [ ] Integrar GPS en Team view (feature PREMIUM ya construida)
- [ ] Unificar WhatsApp en una sola implementación
- [ ] CMS: Loyalty + Reviews + Surveys management UI

**Growth (50%):**
- [ ] Definir con el equipo las features de Sprint 17 Growth
- [ ] Onboarding mejorado (guía de activación de automatizaciones)
- [ ] Notificaciones push (preparación de arquitectura)

---

*Documento generado automáticamente por auditoría de consolidación Sprint 16.1*
*Próxima revisión: post Sprint 17*
