# AI_INFRASTRUCTURE_GROWTH.md
# Shelwi — Proyección de Costos de Infraestructura IA
Fecha: 2026-06-23

---

## SUPUESTOS BASE

- Precio USD estimado: $1 USD = $4.000 COP
- Gemini Flash: ~$0.075/1M tokens input + $0.30/1M tokens output
- Promedio tokens por operación IA: 800 input + 400 output = ~1.200 tokens
- Costo real por operación: ~$0.00018 USD (≈ $0.72 COP)
- Distribución de planes: FREE 40% | PRO 45% | PREMIUM 15%
- Créditos promedio usados: FREE 0 | PRO 180/mes | PREMIUM 600/mes

---

## TABLA DE COSTOS POR ESCENARIO

### 100 usuarios (Alpha/Beta)

| Componente | Costo/mes USD | Notas |
|-----------|--------------|-------|
| Supabase Free/Pro | $25 | Pro suficiente |
| Gemini API | $2 | ~50 ws PRO×180cr + 10 ws PREM×600cr |
| Storage S3 (evidencias) | $0.10 | ~500 MB |
| Edge Functions | $0 | Dentro de free tier |
| pg_cron / Workers | $0 | Incluido en Supabase |
| Resend (emails) | $0 | Free tier |
| MercadoPago | Comisión % | Solo al cobrar |
| **Total fijo mensual** | **~$27 USD** | **~$108.000 COP** |
| **Ingresos estimados** | **~$1.400 USD** | **~$5.600.000 COP** |
| **Margen infra** | **98%** | |

**Trigger de upgrade:** Ninguno a este nivel.

---

### 500 usuarios

| Componente | Costo/mes USD | Notas |
|-----------|--------------|-------|
| Supabase Pro | $25 | Aún suficiente con PgBouncer |
| Gemini API | $10 | ~225 ws PRO + 75 ws PREM |
| Storage S3 | $2 | ~10 GB |
| Edge Functions (invocaciones) | $2 | ~500K invocaciones/mes |
| Workers extra (scheduler) | $0 | Supabase Edge incluido |
| **Total fijo mensual** | **~$39 USD** | **~$156.000 COP** |
| **Ingresos estimados** | **~$7.000 USD** | **~$28.000.000 COP** |
| **Margen infra** | **99.4%** | |

**Trigger de upgrade:** Monitorear conexiones DB concurrentes. Si >60/100 en hora pico → preparar upgrade.

---

### 1.000 usuarios

| Componente | Costo/mes USD | Notas |
|-----------|--------------|-------|
| Supabase Pro | $25 | Borderline — pool de 100 conexiones |
| Gemini API | $20 | ~450 ws PRO + 150 ws PREM |
| Storage S3 | $8 | ~50 GB con evidencias |
| Edge Functions | $5 | ~1M invocaciones |
| integration-worker cola | Crítico | MAX_EVENTS_PER_RUN = 15 recomendado |
| **Total fijo mensual** | **~$58 USD** | **~$232.000 COP** |
| **Ingresos estimados** | **~$14.000 USD** | **~$56.000.000 COP** |
| **Margen infra** | **99.6%** | |

**⚠️ TRIGGER CRÍTICO: 1.000 usuarios**
- Evaluar upgrade Supabase Pro → Team ($599 USD/mes) si hay >70 conexiones simultáneas en pico
- integration-worker necesita ajuste de batch size
- Considerar segundo worker para webhooks

---

### 3.000 usuarios

| Componente | Costo/mes USD | Notas |
|-----------|--------------|-------|
| **Supabase Team** | **$599** | **OBLIGATORIO a este nivel** |
| Gemini API | $55 | ~1.350 ws PRO + 450 ws PREM |
| Storage S3 | $25 | ~180 GB |
| Edge Functions | $15 | ~3M invocaciones |
| pg_cron scheduler | Incluido | Team incluye más recursos |
| Partición ai_usage | $0 | Ya particionada desde Sprint 24 |
| **Total fijo mensual** | **~$694 USD** | **~$2.776.000 COP** |
| **Ingresos estimados** | **~$42.000 USD** | **~$168.000.000 COP** |
| **Margen infra** | **98.3%** | |

**⚠️ ACCIONES REQUERIDAS a 3.000 usuarios:**
- Supabase Team: 500+ conexiones directas → resuelve pool
- Implementar múltiples instancias de integration-worker (shard por ws_id % 3)
- Considerar Redis/Upstash para caché de `check_ai_credits` (reduce DB queries)
- Revisión de vacuum en tablas grandes (`ai_usage`, `gps_events`)

---

### 5.000 usuarios

| Componente | Costo/mes USD | Notas |
|-----------|--------------|-------|
| Supabase Team | $599 | Suficiente con réplicas de lectura |
| **Réplica de lectura** | **$200** | **Para queries analíticas (BI)** |
| Gemini API | $92 | ~2.250 ws PRO + 750 ws PREM |
| Storage S3 | $50 | ~350 GB |
| Edge Functions | $30 | ~5M invocaciones |
| **Redis/Upstash** | **$20** | **Caché de planes y créditos** |
| **Total fijo mensual** | **~$991 USD** | **~$3.964.000 COP** |
| **Ingresos estimados** | **~$70.000 USD** | **~$280.000.000 COP** |
| **Margen infra** | **98.6%** | |

**⚠️ ACCIONES REQUERIDAS a 5.000 usuarios:**
- Read replica: separar queries analíticas (BI, reports) de writes transaccionales
- Redis para `check_ai_credits` (hot path con 50K req/hora)
- Partición de `gps_events` y `audit_log`
- Scheduler dedicado separado del integration-worker
- Monitoreo de índices con pg_stat_user_indexes

---

### 10.000 usuarios

| Componente | Costo/mes USD | Notas |
|-----------|--------------|-------|
| **Supabase Enterprise** | **$2.000+** | **O Supabase Team + PgBouncer externo** |
| Réplica de lectura (x2) | $400 | Carga distribuida por región |
| Gemini API | $185 | ~4.500 ws PRO + 1.500 ws PREM |
| Storage S3 | $120 | ~800 GB |
| Edge Functions | $80 | ~10M invocaciones |
| Redis Cluster | $100 | Alta disponibilidad |
| Workers dedicados (x3) | $50 | Separados por tipo de carga |
| Monitoreo (Datadog/Grafana) | $100 | Alertas en tiempo real |
| **Total fijo mensual** | **~$3.035 USD** | **~$12.140.000 COP** |
| **Ingresos estimados** | **~$140.000 USD** | **~$560.000.000 COP** |
| **Margen infra** | **97.8%** | |

**⚠️ ACCIONES REQUERIDAS a 10.000 usuarios:**
- CQRS parcial: separar DB de escrituras (OLTP) de lecturas analíticas (OLAP)
- Particionado de todas las tablas grandes (ai_usage ✅ ya listo, gps_events, audit_log)
- Archivado automático de datos >1 año (S3 Glacier)
- SLA: response time <200ms p95 para operaciones IA

---

## RESUMEN: CUÁNDO HACER CADA UPGRADE

| Umbral | Acción | Costo adicional |
|--------|--------|----------------|
| >600 ws activos | Ajustar MAX_EVENTS_PER_RUN a 15 | $0 (config) |
| >800 ws activos | Monitorear pool conexiones DB | $0 (config) |
| **1.000 ws activos** | **Evaluar Supabase Team** | **+$574 USD/mes** |
| 1.500 ws activos | 2do integration-worker (webhooks) | $0 (Edge Functions escalan) |
| **3.000 ws activos** | **Supabase Team OBLIGATORIO** | **+$574 USD/mes** |
| 3.000 ws activos | Redis caché hot path | +$20 USD/mes |
| **5.000 ws activos** | **Read replica (BI queries)** | **+$200 USD/mes** |
| 5.000 ws activos | Partición gps_events | $0 (migración) |
| **10.000 ws activos** | **Supabase Enterprise / arquitectura dedicada** | **+$1.400+ USD/mes** |

---

## PROYECCIÓN DE REVENUE IA (paquetes adicionales)

| Umbral | Paquetes vendidos/mes | Revenue adicional IA | % del total |
|--------|----------------------|---------------------|------------|
| 500 usuarios | ~10 | ~$400.000 COP | 2.9% |
| 1.000 usuarios | ~25 | ~$1.000.000 COP | 3.6% |
| 3.000 usuarios | ~80 | ~$3.200.000 COP | 7.6% |
| 5.000 usuarios | ~150 | ~$6.000.000 COP | 8.6% |
| 10.000 usuarios | ~300 | ~$12.000.000 COP | 8.6% |

**La IA adicional representa ~8-9% del revenue total a escala, con margen bruto de ~99% (costo real de Gemini es marginal).**
