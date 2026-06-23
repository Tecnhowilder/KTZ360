# SCALABILITY REPORT — SHELWI
**Post Sprint 16.3**  
**Fecha:** 22 de junio de 2026

---

## CAPACIDAD ACTUAL

Shelwi puede soportar **3.000 workspaces activos** con las optimizaciones del Sprint 16.3.
Para **10.000 workspaces** se requieren las optimizaciones de Sprint P3.

---

## PROYECCIÓN DE CARGA POR ESCENARIO

### Supuestos base
- 1 workspace = 1 empresa cliente
- Promedio: 5 usuarios activos / workspace
- Promedio: 50 cotizaciones / workspace / mes
- Promedio: 20 OTs / workspace / mes
- 8 horas pico por día, 22 días hábiles / mes

### 100 workspaces (estado actual, <$50/mes en Supabase)

| Recurso | Valor mensual | Límite plan |
|---------|--------------|-------------|
| DB reads | ~2M | 500M ✅ |
| DB writes | ~500K | Ilimitado ✅ |
| Storage | ~500MB | 8GB ✅ |
| Edge invocations | ~50K | 500K ✅ |
| IA API calls | ~5K | Sin límite (pago por uso) |

### 1.000 workspaces ($200-400/mes estimado)

| Recurso | Valor mensual | Estado |
|---------|--------------|--------|
| DB reads | ~20M | ✅ OK |
| DB writes | ~5M | ✅ OK |
| Storage | ~5GB | ✅ OK |
| Edge invocations | ~500K | ⚠️ Límite del plan |
| audit_log rows | ~5M | ✅ Manejable |

### 3.000 workspaces ($600-1.200/mes estimado) ← OBJETIVO AÑO 1

| Recurso | Valor mensual | Estado |
|---------|--------------|--------|
| DB reads | ~60M | ✅ OK con índices |
| DB writes | ~15M | ✅ OK |
| Storage | ~15GB | ✅ OK |
| Edge invocations | ~1.5M | 🟠 Requiere plan Enterprise |
| audit_log rows (acumulado) | ~15M/año | ✅ OK sin TTL en año 1 |
| integration-worker runs | ~4.3M/mes | ✅ OK (5 eventos/run) |

### 10.000 workspaces ($2.000-5.000/mes estimado)

| Recurso | Valor mensual | Estado |
|---------|--------------|--------|
| DB reads | ~200M | 🟠 Requiere caché de reportes |
| DB writes | ~50M | ✅ OK |
| Storage | ~50GB | 🟠 Requiere plan Pro+ |
| Edge invocations | ~5M | 🔴 Requiere Enterprise Supabase |
| audit_log rows (3 años) | ~150M | 🟠 Requiere TTL o particionamiento |
| quotes rows (global) | ~500M | 🔴 Requiere particionamiento |

---

## BOTTLENECKS POR ESCENARIO

### Primero en saturarse a escala:

| Escala | Bottleneck #1 | Bottleneck #2 | Bottleneck #3 |
|--------|-------------|-------------|-------------|
| 1K ws | Edge invocations (scheduler c/min) | — | — |
| 3K ws | Edge invocations (>500K/mes) | audit_log sin TTL | — |
| 10K ws | Quotes table scan en reportes | audit_log >100M filas | Edge Enterprise cost |

---

## PLAN DE ACCIÓN POR HITO

### Hito: 500 workspaces (estimado: Q3 2026)
**Acciones necesarias:** Ninguna — Sprint 16.3 cubre este escenario.

### Hito: 1.000 workspaces (estimado: Q4 2026)
**Acciones necesarias:**
1. Optimizar `get_reports_summary()` (P3.1) — range filter
2. Implementar `useQuotes` staleTime=30s (P3 Frontend)
3. Monitorear Edge invocations (cercano al límite 500K/mes)

### Hito: 3.000 workspaces (estimado: Q2 2027)
**Acciones necesarias:**
1. Upgrade Supabase a plan Enterprise (por Edge invocations)
2. Implementar TTL para audit_log (P3.4)
3. Caché materializada de reportes ejecutivos (P4.1)
4. Optimizar `get_reports_summary()` completamente

### Hito: 10.000 workspaces (estimado: 2028)
**Acciones necesarias:**
1. Particionamiento de tablas grandes (quotes, audit_log)
2. Read replicas para reportes
3. CDN para assets estáticos
4. Caché de Redis para dashboard ejecutivo
5. Arquitectura multi-region (opcional)

---

## COSTOS ESTIMADOS SUPABASE

| Escala | Plan recomendado | Costo est./mes |
|--------|-----------------|----------------|
| <500 ws | Pro ($25/mes) | $25-50 |
| 500-1K ws | Pro ($25/mes) + addons | $100-200 |
| 1K-3K ws | Team ($599/mes) | $600-1.200 |
| 3K-10K ws | Enterprise (custom) | $2.000-5.000 |

*Costos son estimaciones. No incluyen IA API costs (Gemini).*

---

## CONCLUSIÓN

**Sprint 16.3** llevó a Shelwi de soportar ~500 workspaces cómodamente a **3.000 workspaces** sin rediseño arquitectónico, con las siguientes mejoras clave:

1. **-95% de queries DB** eliminando el polling de créditos IA
2. **Zero timeouts** en el worker de integraciones
3. **-80% de latencia** en `get_executive_dashboard()`
4. **-97% de queries** en listado de pedidos (N+1 eliminado)
5. **-800KB en bundle** (xlsx lazy loading)
6. **10 índices nuevos** mejorando las 5 RPCs más críticas

El próximo hito de optimización (Sprint P3) debe ejecutarse cuando el sistema alcance **1.000 workspaces activos**.
