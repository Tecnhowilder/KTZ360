# AI_MONETIZATION_ANALYSIS.md
# Shelwi — Análisis de Monetización IA
Fecha: 2026-06-23

---

## 1. MODELO DE NEGOCIO IA ACTUAL vs PROPUESTO

### Modelo actual (Sprint 2–19)
- PRO: 500 créditos incluidos. Sin venta adicional.
- PREMIUM: 2000 créditos incluidos. Sin venta adicional.
- FREE: 0 créditos. Sin acceso.
- **Revenue IA adicional: $0** — los créditos son solo un límite, no generan ingresos extra.

### Modelo propuesto (Sprint 24)
- PRO: 500 créditos incluidos + venta de paquetes adicionales.
- PREMIUM: 2000 créditos incluidos + venta de paquetes adicionales.
- FREE: 0 créditos. Sin acceso. Sin posibilidad de comprar.

---

## 2. CATÁLOGO DE PAQUETES IA

| Pack | Créditos | Precio COP | Precio USD aprox. | Crédito/peso | Margen estimado |
|------|----------|-----------|------------------|-------------|-----------------|
| Starter | 100 | $9.900 | ~$2.50 | 99 c/crédito | Alto |
| Standard | 500 | $39.900 | ~$10.00 | 79.8 c/crédito | Medio-alto |
| Pro | 1.000 | $69.900 | ~$17.50 | 69.9 c/crédito | Medio |
| Enterprise | 5.000 | $249.900 | ~$62.50 | 49.98 c/crédito | Bajo (volumen) |

---

## 3. SIMULACIÓN DE COSTOS IA REALES (Gemini)

### Costo real por operación en Gemini Flash (estimado):

| Operación | Tokens input | Tokens output | Costo USD | Margen con 3 créditos |
|-----------|-------------|--------------|-----------|----------------------|
| generate_description | ~200 | ~200 | $0.00003 | ~99% margen |
| close_probability | ~500 | ~300 | $0.00008 | ~99% margen |
| forecast (comercial) | ~800 | ~500 | $0.00015 | ~98% margen |
| ops_risk_detection | ~1000 | ~500 | $0.00020 | ~98% margen |
| bi_executive_summary | ~1500 | ~600 | $0.00030 | ~97% margen |

**Conclusión:** El costo real de Gemini es ~10-50x menor que lo que se cobra por créditos. El margen en IA adicional es altísimo.

### Costo mensual estimado de IA para Shelwi (1.000 workspaces activos):

| Escenario | Workspaces | Créditos promedio usados | Costo real Gemini/mes |
|-----------|-----------|-------------------------|----------------------|
| Conservador (20% uso) | 200 activos | 300 créditos avg | ~$18 USD/mes |
| Moderado (50% uso) | 500 activos | 400 créditos avg | ~$60 USD/mes |
| Agresivo (80% uso) | 800 activos | 600 créditos avg | ~$130 USD/mes |

**El costo de Gemini es marginal. El riesgo no es costo, es volumen de requests y rate limits del proveedor.**

---

## 4. PROYECCIÓN DE REVENUE ADICIONAL POR PAQUETES IA

### Supuestos:
- 100 workspaces PRO/PREMIUM activos inicialmente
- 15% convierte a comprar paquetes adicionales = 15 workspaces
- Ticket promedio primer mes: pack_500 = $39.900

| Mes | Workspaces con paquete | Revenue adicional | Acumulado |
|-----|------------------------|------------------|-----------|
| 1 | 15 | $598.500 | $598.500 |
| 3 | 35 | $1.396.500 | $2.800.000 |
| 6 | 60 | $2.394.000 | $9.500.000 |
| 12 | 100 | $3.990.000 | $25.000.000 |

**Potencial: $25M COP en 12 meses con solo 100 workspaces que compran paquetes.**

---

## 5. DISEÑO DE TABLAS REQUERIDAS

### `ai_credit_packs` (catálogo administrable):
```sql
CREATE TABLE public.ai_credit_packs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_key    text NOT NULL UNIQUE,    -- 'pack_100', 'pack_500', etc.
  name        text NOT NULL,           -- '100 Créditos IA'
  credits     int  NOT NULL,           -- créditos que otorga
  price_cop   int  NOT NULL,           -- precio en COP
  active      boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- RLS: lectura pública (necesario para el checkout). Escritura solo super_admin.
```

### `ai_credit_purchases` (historial de compras):
```sql
CREATE TABLE public.ai_credit_purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id),
  pack_id         uuid NOT NULL REFERENCES ai_credit_packs(id),
  payment_id      text NOT NULL UNIQUE,    -- de MercadoPago
  credits_total   int  NOT NULL,           -- créditos comprados
  credits_remaining int NOT NULL,          -- créditos no usados aún
  price_paid_cop  int  NOT NULL,
  expires_at      timestamptz NOT NULL,    -- 90 días desde compra
  activated_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- RLS: workspace solo ve sus propias compras. super_admin ve todas.
```

---

## 6. CAMBIO EN check_ai_credits (IMPACTO CRÍTICO)

### Lógica actual:
```
créditos_usados_mes < plan_limits.ai_credits_monthly
```

### Lógica nueva (con paquetes):
```
créditos_usados_mes < (plan_limits.ai_credits_monthly + sum(ai_credit_purchases.credits_remaining WHERE !expired))
```

Este cambio es **backward compatible** — si no hay paquetes comprados, el resultado es idéntico al actual.

---

## 7. INTEGRACIÓN CON MercadoPago (EXISTENTE)

No se crea un nuevo checkout. Se **extiende** `create-checkout` con `type = 'ai_pack'`:

```typescript
// create-checkout body:
{ type: 'ai_pack', packId: 'pack_500' }
// vs actual:
{ type: 'subscription', planCode: 'pro' }
```

El `mp-webhook` existente ya maneja pagos aprobados. Se añade un nuevo `case 'ai_pack'` para activar el paquete.

---

## 8. MÉTRICAS ADMIN IA REQUERIDAS

| Métrica | Fuente de datos | Descripción |
|---------|----------------|-------------|
| Créditos vendidos (packs) | `ai_credit_purchases.credits_total` | Total créditos vendidos en período |
| Créditos consumidos | `ai_usage.credits_used` | Total créditos usados en período |
| Créditos desperdiciados | vendidos - consumidos | Paquetes comprados pero no usados |
| Revenue IA adicional | `ai_credit_purchases.price_paid_cop` | Ingresos por paquetes |
| Costo real IA (Gemini) | `ai_usage.estimated_cost` | Lo que realmente pagamos a Google |
| Margen IA | Revenue - Costo real | Rentabilidad de la IA |
| Top workspaces consumidores | `ai_usage GROUP BY workspace_id` | Para upsell de paquetes |
| Operaciones más usadas | `ai_usage GROUP BY feature` | Para pricing strategy |

---

## 9. VEREDICTO Y PRIORIDADES

### PRIORIDAD 1 — Blocking (sin esto no hay monetización IA):
1. Tablas `ai_credit_packs` + `ai_credit_purchases`
2. Actualizar `check_ai_credits` para incluir paquetes
3. `activate_ai_credit_pack` RPC
4. Extensión de `create-checkout` y `mp-webhook` para paquetes

### PRIORIDAD 2 — Importante (experiencia completa):
5. Feature flags `ai_advanced_enabled`, `ai_forecasting_enabled`
6. `check_ai_operation_permission` para validar flag correcto por operación
7. UI de compra de paquetes en `/app/ia/creditos`
8. Admin IA con métricas de monetización

### PRIORIDAD 3 — Mejoras (observabilidad):
9. `ai_usage.execution_time_ms` y `ai_usage.model`
10. AI Studio V2 unificado
11. `ai_max_requests_day` en plan_limits
