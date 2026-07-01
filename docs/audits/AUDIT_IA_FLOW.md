# AUDIT_IA_FLOW.md
# Shelwi — Estado Real del Módulo IA
Fecha: 2026-06-25

---

## 1. QUÉ EXISTE HOY

### Infraestructura IA (funcional)

| Componente | Archivo | Descripción |
|-----------|---------|-------------|
| `ai-proxy` Edge Function | supabase/functions/ai-proxy | Llama a Gemini, controla créditos, rate limit |
| `callAistudio()` | src/services/aiStudio.ts | Interfaz para llamar ai-proxy |
| `check_ai_credits()` | RPC DB | Verifica créditos disponibles |
| `consume_ai_credits()` | RPC DB | Consume créditos con FIFO paquetes |
| `ai_operation_costs` | DB table | 20+ operaciones con costos |
| `aiCommercial.ts` | src/services/aiCommercial.ts | 14+ funciones IA: forecast, risk, ops, BI |
| `useAI` hook | src/hooks/useAI.ts | React hook para llamar IA |
| `useAICredits` hook | src/hooks/useAICredits.ts | Créditos disponibles |
| `IAAdminTab` | src/components/admin/IAAdminTab.tsx | Gestión admin de IA |

### Vistas IA existentes

| Vista | Ruta | Descripción | Estado |
|-------|------|-------------|--------|
| `KtzIA` | `/app/ia` | Copiloto comercial desktop | ✅ Funcional |
| `ShelwiIAMobile` | `/app/ia` (mobile) | Dashboard IA análisis cotizaciones | ✅ Funcional |
| `IAOperacionesPage` | `/app/ia/operaciones` | 6 análisis IA operativos | ✅ Funcional pero sin nav |
| `BIPage` tab IA | `/app/bi` → tab IA | 4 análisis IA de negocio | ✅ Funcional pero sin nav |
| `FinancePage` tab Forecast | `/app/finanzas` → tab Forecast | Forecast financiero IA | ✅ Funcional pero sin nav |

### Funciones IA disponibles en aiCommercial.ts

| Función | Operación | Créditos | Disponibilidad |
|---------|-----------|---------|---------------|
| `generateDescription()` | generate_description | 1 | PRO+ |
| `improveProposal()` | improve_proposal | 2 | PRO+ |
| `generateBusinessSummary()` | ai_summary | 2 | PRO+ |
| `analyzeCloseProbability()` | close_probability | 3 | PRO+ |
| `getCommercialRecommendations()` | recommendations | 3 | PRO+ |
| `forecastSales()` | forecast | 3 | PRO+ |
| `analyzeClientsAtRisk()` | risk_analysis | 3 | PRO+ |
| `nextBestAction()` | recommendations | 3 | PRO+ |
| `forecastFinance()` | forecast_finance | 3 | PREMIUM |
| `generateExecutiveSummary()` | bi_executive_summary | 3 | PREMIUM |
| `generateBusinessForecast()` | bi_business_forecast | 3 | PREMIUM |
| `generateRiskAssessment()` | bi_risk_assessment | 3 | PREMIUM |
| `generateGrowthRecommendations()` | bi_growth_recs | 3 | PREMIUM |
| `detectOperationalRisks()` | ops_risk_detection | 3 | PREMIUM |
| `detectDelayedWorkOrders()` | ops_delay_analysis | 3 | PREMIUM |
| `detectLowProductivity()` | ops_productivity_analysis | 3 | PREMIUM |
| `detectCostOverruns()` | ops_cost_analysis | 3 | PREMIUM |
| `detectAtRiskProjects()` | ops_project_risk | 3 | PREMIUM |
| `recommendOperationalActions()` | ops_recommendations | 3 | PREMIUM |

---

## 2. QUÉ NO EXISTE — GAPS CRÍTICOS

### GAP 1: Flujo "Crear con voz" (CRÍTICO 🔴)

**Lo que el usuario espera (según spec):**
```
Pulsa "Hablar con IA"
↓
Pantalla con micrófono grande
↓
"¿Qué deseas crear? ○ Cotización ○ Pedido"
↓
Grabar → Transcripción → Búsqueda en catálogo → Vista previa → Crear
```

**Lo que existe actualmente:**
- El botón navega a `/app/ia`
- `/app/ia` muestra análisis de cotizaciones existentes y recomendaciones comerciales
- No hay grabación de voz
- No hay transcripción
- No hay flujo de creación desde voz

**Lo que falta crear:**
1. Vista `IACrearPage` (`/app/ia/crear`)
2. Integración Web Speech API (o Whisper via ai-proxy)
3. Función `createQuoteFromVoice(transcript)` que:
   - Analiza el texto con GPT/Gemini
   - Busca productos en catálogo existente
   - Genera el payload para `openQuoteFlow()`
4. Función `createOrderFromVoice(transcript)` similar

### GAP 2: Creación desde foto (ALTO 🟠)

**Lo que existe**: `KtzIADesktop` tiene un input de imagen que llama `photo_quote` operation.
**Lo que falta**: Versión mobile que active cámara y pase la imagen al flujo existente.

### GAP 3: IA para Pedido directo (ALTO 🟠)

**Lo que falta**: Modo "crear pedido con IA" desde voz, similar al de cotización.

---

## 3. ARQUITECTURA PROPUESTA SIN DUPLICAR

### Vista IACrearPage (`/app/ia/crear`)

```tsx
// Reutiliza: callAistudio(), openQuoteFlow(), navigate()
// Nuevo: Web Speech API + prompt de interpretación
function IACrearPage() {
  const [mode, setMode] = useState<'cotizacion' | 'pedido'>('cotizacion');
  const [transcript, setTranscript] = useState('');
  const [preview, setPreview] = useState(null);
  
  // 1. Grabación via Web Speech API (nativo, sin costo)
  // 2. Transcript → callAistudio('generate_description') o prompt especial
  // 3. Resultado → openQuoteFlow() con serviceLines pre-cargadas
  // 4. O → navigate('/app/pedidos/nuevo') con datos
}
```

**Reutiliza sin duplicar:**
- `callAistudio()` — mismo motor, solo un prompt diferente
- `openQuoteFlow()` — mismo flujo de cotización
- `defaultQConfig(company)` — misma configuración
- Catálogo existente para buscar productos
- `consume_ai_credits()` — mismo sistema de créditos

### Prompt sugerido para interpretación

```
Contexto: catálogo de servicios del workspace = [lista del catálogo]
Input del usuario: "${transcript}"

Extrae:
1. Tipo: cotizacion o pedido
2. Cliente mencionado (nombre/empresa)
3. Servicios del catálogo que aplican
4. Cantidades implícitas
5. Notas adicionales

Responde en JSON estructurado para crear la cotización.
```

---

## 4. ESTADO REAL DEL MÓDULO IA — RESUMEN

| Función | Estado | Accesible desde nav |
|---------|--------|---------------------|
| Análisis de cotizaciones | ✅ Funcional | ✅ /app/ia |
| Recomendaciones comerciales | ✅ Funcional | ✅ /app/ia |
| Forecast de ventas | ✅ Funcional | ✅ /app/ia (mobile) |
| Análisis de riesgo clientes | ✅ Funcional | ✅ /app/ia |
| IA Financiera | ✅ Funcional | ❌ Solo /app/finanzas |
| IA Business Intelligence | ✅ Funcional | ❌ Solo /app/bi |
| IA Operativa | ✅ Funcional | ❌ Solo /app/ia/operaciones |
| **Crear cotización por voz** | ❌ NO EXISTE | ❌ — |
| **Crear pedido por voz** | ❌ NO EXISTE | ❌ — |
| **Desde foto mobile** | ❌ NO EXISTE | ❌ — |
| Forecast financiero | ✅ Funcional | ❌ Solo /app/finanzas |

---

## 5. REUTILIZACIÓN — LO QUE NO SE DEBE DUPLICAR

Para implementar el flujo de voz:
- ✅ Usar `callAistudio()` existente — NO crear nuevo cliente IA
- ✅ Usar `openQuoteFlow()` existente — NO crear nuevo flujo de cotización
- ✅ Usar catálogo existente — NO crear nuevo sistema de productos
- ✅ Usar `consume_ai_credits()` existente — NO nuevo sistema de créditos
- ✅ Usar Web Speech API del navegador — NO costo adicional de STT
- ✅ Usar `create_direct_order` (a crear) — reutilizar lógica de pedidos
