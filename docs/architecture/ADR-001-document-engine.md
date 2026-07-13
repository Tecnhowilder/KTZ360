# ADR-001 — Document Engine: Módulo compartido para documentos comerciales

**Fecha:** 2026-07-01  
**Estado:** Activo  
**Contexto:** Sprint de rediseño del módulo de Pedidos

---

## Decisión

Se crea `src/lib/document-engine/` como infraestructura compartida para wizard de documentos comerciales (Cotizaciones, Pedidos, Remisiones, Proformas, etc.).

Se crea `src/components/document-wizard/` como módulo de componentes UI compartidos.

## Estructura actual

```
src/lib/document-engine/
  index.ts       ← re-exporta itemEngine + tipos base del wizard
  draft.ts       ← createDraftHooks genérico (factory pattern)

src/components/document-wizard/
  index.ts             ← barrel: re-exports + componentes propios
  WizardProgress.tsx   ← barra de pasos configurable (reemplaza QuoteProgress hardcoded)
  WizardStepPreview.tsx← vista previa + compartir genérica (no acopla quote_access_tokens)

src/hooks/
  useOrderDraft.ts     ← draft de pedidos (clave: ktz_order_draft_v2_*)

supabase/migrations/
  0124_order_public_portal.sql ← order_access_tokens + RPCs + RLS

src/services/
  orderPortal.ts       ← espejo de publicPortal.ts para pedidos
```

## Estado de transición de componentes

`components/document-wizard/index.ts` re-exporta desde `components/quote-new/`:
- `StepClient`, `StepItems`, `StepCosts`, `AddItemSheet`

Esto es **temporal**. La migración definitiva pendiente es:

1. Mover el contenido físico de `StepClient.tsx`, `StepItems.tsx`, `StepCosts.tsx`, `AddItemSheet.tsx` a `document-wizard/`.
2. Actualizar `QuoteNewPage.tsx` y `EditQuotePage.tsx` para importar desde `document-wizard/`.
3. Los archivos en `quote-new/` quedan vacíos o se eliminan.

**Por qué no se hizo ahora:** Con solo 3 callers, el riesgo es bajo pero el impacto en revisión de código es mayor al beneficio inmediato. Se pospone a un sprint de refactor.

## Principios de diseño

### Sin condicionales de tipo en componentes compartidos
`WizardStepPreview` usa callbacks inyectados (`onGetShareUrl`, `onOpenDocument`) en lugar de detectar el tipo de documento. Cada wizard (Cotizaciones, Pedidos) pasa sus propias implementaciones.

### Draft por tipo de documento
Clave distinta por módulo evita colisiones de localStorage:
- Cotizaciones: `ktz_quote_draft_v2_{workspaceId}`
- Pedidos:      `ktz_order_draft_v2_{workspaceId}`

### DocumentOverlay no se modifica
`DocumentOverlay.tsx` sirve exclusivamente a Cotizaciones. Para Pedidos se crea `OrderDocumentOverlay.tsx` independiente que usa un renderer HTML propio (no `ProposalDocument`, que tiene 20+ props quote-específicos).

### Portal público paridad
`/o/:token` replica exactamente el nivel de seguridad de `/p/:token`:
- Tabla `order_access_tokens` (espejo de `quote_access_tokens`)
- RPC `get_public_order` SECURITY DEFINER (valida token en DB)
- RLS: acceso autenticado por workspace + acceso anónimo por token

## Documentos futuros soportados

Para agregar un nuevo tipo de documento (Remisión, Factura Proforma, OT, etc.):

1. Crear `src/views/RemisionNuevoPage.tsx` usando wizard components
2. Crear `src/hooks/useRemisionDraft.ts` con `createDraftHooks('ktz_remision_draft_v1', 1)`
3. Crear `src/services/remisionPortal.ts` (opcional si necesita link público)
4. Crear migración para `remision_access_tokens` (opcional)

**Sin modificar** ningún archivo de Cotizaciones o Pedidos.

## Escalabilidad (5000+ usuarios)

- RPCs SECURITY DEFINER minimizan round-trips al DB
- React Query con staleTime 5min reduce carga en DB
- Draft localStorage no escala a DB (correcto: datos efímeros por sesión)
- Índices en `order_access_tokens(token)` y `order_access_tokens(order_id)` garantizan O(1)
- `order_events` tiene índice en `order_id` para lookup por pedido

## Archivos que NO deben modificarse

| Archivo | Razón |
|---------|-------|
| `components/quote-new/StepClient.tsx` | Referenciado por re-export temporal |
| `components/quote-new/StepItems.tsx` | Referenciado por re-export temporal |
| `components/quote-new/StepCosts.tsx` | Referenciado por re-export temporal |
| `components/quote-new/StepPreviewShare.tsx` | Quote-específico, no se reutiliza |
| `components/overlays/DocumentOverlay.tsx` | Quote-específico, no se reutiliza |
| `services/quotes.ts` | Sin cambios |
| `hooks/useDraftQuote.ts` | Sin cambios |
| `views/QuoteNewPage.tsx` | Sin cambios |
| `views/EditQuotePage.tsx` | Sin cambios |
