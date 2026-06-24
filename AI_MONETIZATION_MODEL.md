# AI_MONETIZATION_MODEL — Shelwi Modelo de Monetización IA

> Fecha: 2026-06-23 | Fuente: Sprint 24 Oficial

---

## 1. MODELO DE CRÉDITOS IA

### 1.1 Créditos incluidos por plan

| Plan | Precio/mes | Créditos IA/mes | Costo por crédito (implícito) |
|------|-----------|----------------|-------------------------------|
| FREE | $0 | 0 | N/A |
| PRO | $59.900 | 500 | $119.8/crédito |
| PREMIUM | $179.900 | 2.000 | $89.95/crédito |
| ENTERPRISE | $399.900 | 5.000 | $79.98/crédito |

### 1.2 Addons de Créditos IA

| Pack | Precio | Créditos | Costo/crédito |
|------|--------|---------|---------------|
| Starter | $9.900 | 100 | $99/crédito |
| Pro Pack | $39.900 | 500 | $79.8/crédito |
| Premium Pack | $69.900 | 1.000 | $69.9/crédito |
| Enterprise Pack | $249.900 | 5.000 | $49.98/crédito |

**Estrategia:** Los addons tienen menor costo/crédito a mayor volumen = incentivar compras grandes.

---

## 2. COSTO REAL IA (Proveedor: Gemini 2.5 Flash)

### 2.1 Costo Gemini 2.5 Flash
- Input: $0.075 USD/1M tokens (≈ $300 COP/1M tokens a TRM 4.000)
- Output: $0.30 USD/1M tokens (≈ $1.200 COP/1M tokens)
- Promedio estimado por operación: ~800 tokens promedio input+output

### 2.2 Costo real por operación

| Operación | Créditos cobrados | Tokens promedio | Costo real (USD) | Costo real (COP) | Margen |
|-----------|------------------|-----------------|-----------------|-----------------|--------|
| generate_description | 1 | 300 | $0.000090 | $0.36 | ~99% |
| improve_proposal | 2 | 600 | $0.000180 | $0.72 | ~99% |
| ai_summary | 2 | 500 | $0.000150 | $0.60 | ~99% |
| close_probability | 3 | 800 | $0.000240 | $0.96 | ~99% |
| recommendations | 3 | 1.000 | $0.000300 | $1.20 | ~99% |
| forecast | 3 | 1.200 | $0.000360 | $1.44 | ~99% |
| bi_executive_summary | 3 | 1.000 | $0.000300 | $1.20 | ~99% |
| ops_risk_detection | 3 | 800 | $0.000240 | $0.96 | ~99% |
| photo_quote | 5 | 2.000 | $0.000600 | $2.40 | ~99% |

**El costo real de Gemini es ~10x menor que el costo implícito por crédito.**

### 2.3 Costo total IA estimado a 10K workspaces/mes

| Escenario | Workspaces | Créditos consumidos | Costo Gemini (USD) | Costo Gemini (COP) |
|-----------|-----------|---------------------|-------------------|-------------------|
| 30% utilización | 10.000 | 3.5M créditos | $1.050 | $4.2M |
| 60% utilización | 10.000 | 7M créditos | $2.100 | $8.4M |
| 90% utilización | 10.000 | 10.5M créditos | $3.150 | $12.6M |

**Ingresos IA potenciales (10K ws, 60% util):**
- PRO (3.000 ws × $59.900) = $179.7M COP/mes
- PREMIUM (800 ws × $179.900) = $143.9M COP/mes
- ENTERPRISE (200 ws × $399.900) = $79.98M COP/mes
- Addons: ~$30M COP estimado
- **TOTAL: ~$433M COP/mes**
- Costo IA: ~$8.4M COP (1.9% de ingresos)
- **Margen neto IA: 98.1%**

---

## 3. MATRIZ DE RENTABILIDAD POR PLAN

| Plan | Ingresos/ws | Costo IA max | Margen min |
|------|------------|-------------|-----------|
| FREE | $0 | $0 (0 créditos) | N/A |
| PRO | $59.900 | ~$500 (si usa 500 créditos todos) | 99.1% |
| PREMIUM | $179.900 | ~$2.000 (si usa 2000 créditos) | 98.9% |
| ENTERPRISE | $399.900 | ~$5.000 (si usa 5000 créditos) | 98.7% |

**Conclusión: La IA tiene márgenes superiores al 98% en todos los planes.**

---

## 4. REGLAS DE NEGOCIO IA

### 4.1 Restricciones por plan
```
FREE:       ai_enabled = false → 0 créditos → BLOQUEAR en ai-proxy + RLS
PRO:        ai_enabled = true  → 500 créditos/mes → SOLO operaciones comerciales básicas
PREMIUM:    ai_enabled = true  → 2.000 créditos/mes → Todas las operaciones
ENTERPRISE: ai_enabled = true  → 5.000 créditos/mes → Todas + Agentes IA
```

### 4.2 Reseteo de créditos
- Los créditos se resetean el **día 1 de cada mes** (controlado por `period_month` en `ai_usage`)
- Los addons NO se acumulan entre meses — se usan dentro del período de vigencia
- Los créditos NO se acumulan (use-it-or-lose-it mensual)

### 4.3 Alertas de créditos
- Al 80%: notificación en UI
- Al 95%: notificación urgente + sugerir addon
- Al 100%: bloquear IA + mostrar upgrade modal

### 4.4 Agentes IA
- PREMIUM: 1 agente IA incluido
- ENTERPRISE: agentes ilimitados
- FREE/PRO: sin acceso a agentes

---

## 5. CONTROL ADMINISTRATIVO

### 5.1 Dashboard Admin IA (necesario en Sprint 24)
El admin debe ver:
- Total créditos vendidos (plan_limits × workspaces activos)
- Total créditos consumidos (SUM ai_usage.credits_used período actual)
- Créditos addon vendidos (workspace_ai_addons)
- Costo real Gemini (SUM ai_usage.estimated_cost)
- Margen IA
- Top 10 workspaces por consumo
- Operaciones más costosas

### 5.2 RPC Admin requerida
```sql
-- Obtener dashboard global IA para super admin
CREATE OR REPLACE FUNCTION public.admin_get_ai_dashboard()
RETURNS jsonb
SECURITY DEFINER
-- Solo accesible por is_support_admin()
```

---

## 6. ADDONS DE STORAGE (referencia)

Storage addons existentes (migr 0071):
| Addon | Precio | GB |
|-------|--------|---|
| Starter | $14.900 | +10 GB |
| Mid | $24.900 | +25 GB |
| Pro | $35.900 | +50 GB |

**Storage incluido en nuevo matrix:**
- PRO: 1 GB (update de 0 GB → 1 GB)
- PREMIUM: 20 GB (update de 5 GB → 20 GB)
- ENTERPRISE: 100 GB
