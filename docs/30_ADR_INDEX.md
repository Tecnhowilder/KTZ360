# ADR INDEX — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Índice de todos los Architecture Decision Records
> Ver: `docs/31_ARCHITECTURE_DECISION_RECORDS.md` para el contenido completo

---

## ¿QUÉ ES UN ADR?

Un Architecture Decision Record (ADR) documenta una decisión arquitectónica significativa:
- **Por qué** se tomó esa decisión
- **Qué alternativas** se consideraron
- **Qué consecuencias** tiene
- **Cuándo fue tomada** y si sigue vigente

**Regla fundamental:** Ningún cambio arquitectónico se implementa sin un ADR aprobado.

---

## CATÁLOGO DE ADRs

| ID | Título | Estado | Fecha | Impacto |
|---|---|---|---|---|
| ADR-001 | React 19 + Vite 8 como stack frontend | ✅ Aceptado | Sprint 1 | Alto |
| ADR-002 | Supabase como BaaS (DB + Auth + Storage + Edge) | ✅ Aceptado | Sprint 1 | Crítico |
| ADR-003 | Capacitor 8 para mobile (no React Native) | ✅ Aceptado | Sprint 2 | Alto |
| ADR-004 | Dexie 4 para base de datos offline | ✅ Aceptado | Sprint 4 | Alto |
| ADR-005 | Edge Functions (Deno) para lógica server-side | ✅ Aceptado | Sprint 1 | Crítico |
| ADR-006 | Gemini 2.5 Pro como modelo IA primario | ✅ Aceptado | Sprint 8 | Alto |
| ADR-007 | NVIDIA NIM como proveedor IA secundario/fallback | ✅ Aceptado | Sprint 12 | Medio |
| ADR-008 | Arquitectura de AI Orchestrator (ai-proxy único) | ✅ Aceptado | Sprint 8 | Crítico |
| ADR-009 | Zero Trust: workspace_id nunca del cliente | ✅ Aceptado | Sprint 3 | Crítico |
| ADR-010 | RLS como mecanismo primario de multi-tenancy | ✅ Aceptado | Sprint 1 | Crítico |
| ADR-011 | Event-Driven Architecture (DOMAIN.ENTITY.ACTION) | ✅ Aceptado | Sprint 6 | Alto |
| ADR-012 | Tool Registry: agentes nunca acceden SQL directo | ✅ Aceptado | Sprint 8 | Crítico |
| ADR-013 | Capability Engine: toda acción de negocio = Capability | ✅ Aceptado | Sprint 8 | Alto |
| ADR-014 | Memory Engine: 5 tipos de memoria para agentes IA | ✅ Aceptado | Sprint 9 | Alto |
| ADR-015 | Policy Engine: 4 modos de autonomía de agentes | ✅ Aceptado | Sprint 9 | Alto |

---

## PROCESO PARA CREAR UN NUEVO ADR

1. Identificar la decisión arquitectónica
2. Crear sección en `docs/31_ARCHITECTURE_DECISION_RECORDS.md` con el próximo número
3. Actualizar este índice (`docs/30_ADR_INDEX.md`)
4. Referenciar el ADR en `docs/01_ARCHITECTURE_CONSTITUTION.md` si es crítico
5. Hacer PR con el ADR antes de implementar la decisión

**Plantilla:**
```markdown
## ADR-NNN: [Título de la Decisión]

**Fecha:** YYYY-MM-DD
**Estado:** Propuesto | Aceptado | Deprecado | Supersedido por ADR-XXX
**Autor:** [nombre]

### Contexto
[Por qué se necesita tomar esta decisión]

### Alternativas consideradas
1. [Opción A] — [pros y contras]
2. [Opción B] — [pros y contras]
3. [Opción C] — [pros y contras]

### Decisión
[Qué se decidió y por qué]

### Consecuencias
**Positivas:**
- [...]

**Negativas / Trade-offs:**
- [...]

### Estado de implementación
[Dónde está implementado en el código]
```

---

*Ver: `docs/31_ARCHITECTURE_DECISION_RECORDS.md` para el contenido completo de cada ADR*
*Ver: `docs/01_ARCHITECTURE_CONSTITUTION.md` para los principios que guían las decisiones*
