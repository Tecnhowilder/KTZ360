# ROADMAP POST-PRODUCCIÓN — SHELWI

**Fecha:** 2026-06-22 | **Base:** Sprint 16.2 Hardening completado

---

## SPRINT 17 — GROWTH + DEUDA TÉCNICA ALTA

**Objetivo:** Consolidar la base técnica y habilitar el crecimiento.

### 17.1 — Consolidación técnica (50%)

| Tarea | Deuda origen | Impacto |
|---|---|---|
| Unificar WhatsApp en `services/whatsapp.ts` | Sprint 1/11 | Consistencia |
| Migrar Desktop Reportes a RPCs backend | Sprint 5 | Zero Trust |
| CMS: Loyalty, Reviews, Surveys management UI | Sprint 16 | Feature activa |
| Integrar GPS en Team desktop | Sprint 8 | Feature PREMIUM |
| Crear hooks: `useReviews`, `useSurveys`, `useLoyalty` | Sprint 16 | Clean code |
| Renombrar `KtzIA.tsx` → `ShelwiIA.tsx` | Sprint 2 | Marca |

### 17.2 — Growth features (50%)

*Definir con el equipo de producto*

---

## SPRINT 18 — ENTERPRISE

**Objetivo:** Preparar Shelwi para clientes empresa con requerimientos avanzados.

### Candidatos

- BYOS (Bring Your Own Storage) — Drive/OneDrive como almacenamiento principal
- Custom domains para el portal del cliente
- SSO / SAML para empresas
- Advanced analytics con AI
- Módulo de proyectos (tabla `projects` ya existe)
- Módulo de leads (tabla `leads` ya existe)

---

## MÉTRICAS A MONITOREAR POST-PRODUCCIÓN

| Métrica | Target | Alerta si |
|---|---|---|
| `integration_events.status = 'failed'` | < 5% del total | > 10% en 24h |
| `survey_responses` por workspace | tracking | caída > 50% semanal |
| `portal_access_log` aperturas | tracking | pico inusual (bot) |
| `automation_logs.status = 'blocked_loop'` | 0 | cualquier aparición |
| `storage_used_bytes` / `max_storage_gb` | < 80% | workspace > 90% |

---

## DEUDA TÉCNICA PENDIENTE (ordenada por prioridad)

### Alta prioridad (antes de Sprint 18)
1. WhatsApp: 3 implementaciones → 1
2. Desktop Reportes: calcular en backend
3. CMS Loyalty/Reviews/Surveys
4. GPS desktop view

### Media prioridad (Sprint 18)
5. `workspace_features` tabla → deprecar
6. `leads` y `projects` → decidir: implementar o eliminar ruta
7. Triggers de quotes → consolidar en uno
8. OAuth callback → usar state en lugar de query param

### Baja prioridad (backlog)
9. `KtzIA.tsx` → `ShelwiIA.tsx`
10. `service_materials` → documentar o eliminar
11. `attachments` bucket → deprecar formalmente
12. `/app/proyectos` → implementar o eliminar ruta
