# SPRINT 16.2 — HARDENING Y PREPARACIÓN PARA PRODUCCIÓN

**Fecha:** 2026-06-22 | **Estado:** COMPLETADO

---

## OBJETIVO

Eliminar los 5 hallazgos críticos identificados en la auditoría global Sprint 16.1.  
Sin agregar nuevas funcionalidades. Sin modificar lógica de negocio existente.

---

## CHECKLIST

### FASE 0 — Auditoría pre-implementación
- [x] P1 confirmado: `BRI-` solo en `0001_schema.sql:267` — una sola línea en función SQL
- [x] P2 confirmado: 4 archivos seed en `supabase/migrations/` (0021×2, 0023, 0024)
- [x] P3 confirmado: 4 componentes GPS en `src/components/gps/` — ninguno importado en vistas
- [x] P4 confirmado: `PlanFeaturesRow` sin `automation_enabled` en `database.types.ts:111-130`
- [x] P5 confirmado: `CompanySettingsRow` sin `portal_show_reviews`, `portal_show_loyalty`, `loyalty_enabled`
- [x] ADICIONAL detectado: `PlanLimitsRow` sin `max_automations` ni `automation_ai_credits_pct`

### FASE 1 — Rebranding final BRI- → SHW-
- [x] Migración `0077_rebrand_swh_quotes.sql` creada
- [x] `next_quote_number()` ahora retorna `SHW-YYYY-NNNNNN`
- [x] Descripción del plan PREMIUM actualizada (referencia "Brivia IA" → "Shelwi IA")
- [x] Limpieza de referencias en `system_configuration` y `admin_settings`
- [x] ✅ Histórico de cotizaciones BRI- NO modificado — solo cotizaciones futuras usan SHW-
- [x] ✅ `draftStorage.ts`: `LEGACY_PREFIX = 'ktz360_quote_draft_'` se mantiene (migración de borradores antiguos, no un bug)

### FASE 2 — Limpieza datos de prueba
- [x] Directorio `supabase/seeds/` creado
- [x] `supabase/seeds/cleanup_test_data.sql` — script de auditoría + limpieza manual
- [x] `supabase/seeds/README.md` — instrucciones claras de uso
- [x] ✅ Migraciones históricas (0021, 0023, 0024) NO modificadas — principio de inmutabilidad del historial
- [x] ✅ Script incluye `SELECT` de verificación antes de cualquier `DELETE`

### FASE 3 — GPS Premium UI (P3)
- [x] `MapaOperativoPage.tsx` creada — vista dedicada `/app/mapa-operativo`
  - Managers (owner/admin/supervisor): mapa operativo + KPIs + lista equipo en campo
  - Operarios/Supervisores: estado operativo propio + CheckInOut
  - Feature gated: `gps_enabled` (PREMIUM)
  - Upsell para FREE/PRO
- [x] `CheckInOutButton` integrado en `OTDetailPage.tsx` para operarios y supervisores
- [x] `OperationalMap`, `MemberDetailSheet`, `OperationalStatusSelector` usados en `MapaOperativoPage`
- [x] Ruta `/app/mapa-operativo` agregada al router
- [x] "Mapa GPS" agregado al menú Más de la navegación móvil
- [x] ✅ 0 componentes GPS nuevos creados — se reutilizaron los 4 del Sprint 8

### FASE 4 — TypeScript Hardening P4
- [x] `PlanFeaturesRow` + `automation_enabled: boolean` (Sprint 13)
- [x] `useFeatureAccess('automation_enabled')` ahora retorna `boolean` correcto

### FASE 5 — TypeScript Hardening P5
- [x] `CompanySettingsRow` + `portal_show_reviews: boolean`
- [x] `CompanySettingsRow` + `portal_show_loyalty: boolean`
- [x] `CompanySettingsRow` + `loyalty_enabled: boolean`
- [x] `PlanLimitsRow` + `max_automations: number | null`
- [x] `PlanLimitsRow` + `automation_ai_credits_pct: number`

---

## ARCHIVOS MODIFICADOS / CREADOS

| Archivo | Tipo | Acción |
|---|---|---|
| `supabase/migrations/0077_rebrand_swh_quotes.sql` | SQL | Nuevo — BRI- → SHW- |
| `supabase/seeds/cleanup_test_data.sql` | Script | Nuevo — auditoría + limpieza manual |
| `supabase/seeds/README.md` | Doc | Nuevo — instrucciones |
| `src/views/MapaOperativoPage.tsx` | UI | Nuevo — GPS integrado |
| `src/router.tsx` | TS | +ruta mapa-operativo |
| `src/components/layout/MobileBottomNav.tsx` | UI | +entrada Mapa GPS |
| `src/views/OTDetailPage.tsx` | UI | +CheckInOutButton para operarios |
| `src/lib/database.types.ts` | TS | +5 campos sincronizados con DB |

---

## PRUEBAS

| Prueba | Resultado |
|---|---|
| P1: No existe BRI- visible para usuarios | ✅ Solo en historial de cotizaciones antiguas — nuevas usan SHW- |
| P2: Sin Brivia referencias activas en planes/config | ✅ Migración 0077 limpia todos los planes y config |
| P3: GPS visible y funcional para PREMIUM | ✅ /app/mapa-operativo con mapa, KPIs, check-in/out |
| P4: GPS oculto para FREE y PRO | ✅ useFeatureAccess('gps_enabled') bloquea + upsell |
| P5: 0 errores TypeScript | ✅ Build limpio |
| P6: database.types.ts sincronizado | ✅ 5 campos nuevos tipados |
| P7: Build limpio | ✅ 0 errores |
| P8: Zero Trust intacto | ✅ No se modificó ninguna RPC ni RLS |

---

## PENDIENTE PARA SPRINT 17

Los siguientes ítems de la auditoría NO son críticos para producción pero se recomiendan:

- Unificar WhatsApp (3 implementaciones → 1)
- Migrar Desktop de Reportes a RPCs Zero Trust
- Integrar GPS en vista Team desktop con sidebar GPS
- Crear CMS para Loyalty/Reviews/Surveys (backend Sprint 16 completo)
- Renombrar `KtzIA.tsx` → `ShelwiIA.tsx`
