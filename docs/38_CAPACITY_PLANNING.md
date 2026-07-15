# CAPACITY PLANNING — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Planificación de capacidad para crecimiento sostenido

---

## 1. MÉTRICAS ACTUALES DE LÍNEA BASE

*Actualizar con datos reales del dashboard de Supabase cada trimestre.*

| Recurso | Valor actual (estimado) | Fecha de revisión |
|---|---|---|
| DB size | — | — |
| Tabla más grande | — | — |
| Edge Function invocations/día | — | — |
| Storage usado | — | — |
| Auth users | — | — |
| Costo AI mensual | — | — |
| Costo Supabase mensual | — | — |

---

## 2. UMBRALES Y ACCIONES

### 2.1 Base de datos

| Umbral | Acción |
|---|---|
| DB > 60% del storage del plan | Revisar tablas grandes, archivar datos históricos |
| DB > 80% | Upgrade de plan Supabase o archivar datos urgente |
| Conexiones activas > 80% del pool | Revisar connection pooling, cerrar conexiones idle |
| Tabla `audit_log` > 5M filas | Implementar partitioning y archivado automático |
| Tabla `ai_usage` > 5M filas | Implementar partitioning |
| Query lenta detectada (P95 > 500ms) | `EXPLAIN ANALYZE` + agregar índice |

### 2.2 Edge Functions

| Umbral | Acción |
|---|---|
| Invocaciones > 80% del límite del plan | Revisar llamadas innecesarias, optimizar |
| `ai-proxy` error rate > 1% | Revisar logs, verificar fallback NVIDIA |
| Cold start > 500ms | Implementar keep-warm pings |

### 2.3 Storage

| Umbral | Acción |
|---|---|
| Storage > 60% del plan | Revisar imágenes sin comprimir, limpiar temporales |
| Storage > 80% | Upgrade plan o implementar compresión obligatoria de imágenes |

### 2.4 Costos IA

| Umbral | Acción |
|---|---|
| Costo IA > $5 empresa/mes (promedio) | Revisar modelo usado, optimizar prompts |
| Costo total mensual > $200 IA | Revisar empresas con alto consumo, aplicar límites |
| Una empresa > $20/mes IA | Contactar empresa, verificar uso normal |

---

## 3. MODELO DE PROYECCIÓN DE CRECIMIENTO

### 3.1 Crecimiento de datos por empresa

| Módulo | Registros/empresa/mes (estimado) | Impacto DB |
|---|---|---|
| Clientes | ~50 nuevos/mes | Bajo |
| Cotizaciones | ~100/mes | Bajo-Medio |
| Tareas | ~200/mes | Medio |
| GPS events | ~500/mes (si activo) | Medio-Alto |
| audit_log | ~2000/mes | Alto |
| ai_usage | ~500 calls/mes | Medio-Alto |

### 3.2 Proyección a 12 meses

| Empresas | Filas audit_log | Filas ai_usage | DB total estimada |
|---|---|---|---|
| 50 | 1.2M | 300K | ~10 GB |
| 200 | 4.8M | 1.2M | ~40 GB |
| 500 | 12M | 3M | ~100 GB |
| 1000 | 24M | 6M | ~200 GB |

**Acción trigger para partitioning:** 5M filas en audit_log o ai_usage.

---

## 4. PRESUPUESTO DE INFRAESTRUCTURA

### 4.1 Costo estimado de Supabase por fase

| Fase | Plan | Costo mensual estimado |
|---|---|---|
| Actual (~50 empresas) | Pro | ~$25-50 USD |
| 200 empresas | Pro o Pro+Storage | ~$50-100 USD |
| 500 empresas | Team | ~$100-200 USD |
| 1000+ empresas | Business | ~$200-500 USD |

*Nota: Los precios de Supabase cambian. Verificar en supabase.com/pricing.*

### 4.2 Costo estimado de IA

| Empresas activas | Costo Gemini/mes | Costo NVIDIA/mes | Total IA/mes |
|---|---|---|---|
| 50 | ~$50-100 | ~$10-20 | ~$60-120 |
| 200 | ~$200-400 | ~$40-80 | ~$240-480 |
| 500 | ~$500-1000 | ~$100-200 | ~$600-1200 |

*Estrategia: A partir de 200 empresas, implementar límites de créditos IA por plan y empresa.*

---

## 5. TRIGGERS DE REVISIÓN DE CAPACIDAD

**Revisión mensual:**
- Crecimiento de DB size
- Costo AI mensual vs presupuesto
- Empresas activas

**Revisión trimestral:**
- ¿Es el plan de Supabase suficiente?
- ¿Hay queries lentas nuevas en pg_stat_statements?
- ¿El modelo de IA sigue siendo costo-efectivo?
- ¿Las tablas de alta escritura necesitan partitioning?

**Trigger de escalado urgente:**
- Cualquier métrica > 80% del límite del plan
- Error rate > 1% en Edge Functions
- Costo AI > 50% por encima del presupuesto

---

## 6. CHECKLIST DE REVISIÓN TRIMESTRAL

```
□ Revisar tamaño de todas las tablas (pg_relation_size)
□ Revisar queries lentas (pg_stat_statements)
□ Revisar costo AI mensual vs proyección
□ Revisar storage de Supabase
□ Revisar plan de Supabase vs uso actual
□ Actualizar proyecciones de la sección 3.2
□ Revisar índices de las tablas más grandes
□ Documentar hallazgos y acciones en este archivo
```

---

*Ver: `docs/36_SCALABILITY_GUIDE.md` para estrategias técnicas de escalabilidad*
*Ver: `docs/21_OBSERVABILITY_GUIDE.md` para métricas a monitorear*
*Ver: `docs/25_PLATFORM_STABILITY_GUIDE.md` para umbrales de alerta operativos*
