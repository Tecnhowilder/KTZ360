# MODEL REGISTRY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Catálogo de modelos IA disponibles y criterios de selección
> Implementación: `supabase/functions/_shared/orchestrator.ts`

---

## 1. MODELOS DISPONIBLES

### 1.1 Google Gemini (Proveedor Principal)

| ID | Nombre | Uso Ideal | Contexto Max | Costo Input | Costo Output |
|---|---|---|---|---|---|
| `gemini-2.5-pro` | Gemini 2.5 Pro | Razonamiento complejo, análisis profundo, código | 1M tokens | ~$1.25/1M tok | ~$5/1M tok |
| `gemini-2.5-flash` | Gemini 2.5 Flash | Tareas rápidas, clasificación, respuestas simples | 1M tokens | ~$0.075/1M tok | ~$0.30/1M tok |
| `gemini-2.0-flash` | Gemini 2.0 Flash | Legacy fallback | 1M tokens | ~$0.10/1M tok | ~$0.40/1M tok |
| `text-embedding-004` | Embedding | Vectorización para Memory Engine | — | ~$0.025/1M tok | — |

### 1.2 NVIDIA NIM (Proveedor Secundario / Fallback)

| ID | Nombre | Uso Ideal | Contexto Max | Costo |
|---|---|---|---|---|
| `meta/llama-3.3-70b-instruct` | Llama 3.3 70B | Fallback general, texto en español | 128k tokens | ~$0.23/1M tok |
| `nvidia/llama-3.1-nemotron-70b` | Nemotron 70B | Razonamiento especializado | 128k tokens | ~$0.23/1M tok |

---

## 2. LÓGICA DE SELECCIÓN DE MODELO

```typescript
// En _shared/orchestrator.ts
function selectModel(task: OrchestratorTask): ModelConfig {
  // Por tipo de tarea
  if (task.type === 'classification') return { model: 'gemini-2.5-flash', maxTokens: 100 };
  if (task.type === 'embedding') return { model: 'text-embedding-004' };
  if (task.type === 'reasoning') return { model: 'gemini-2.5-pro', maxTokens: 8000 };
  if (task.type === 'output_validation') return { model: 'gemini-2.5-flash', maxTokens: 50 };
  
  // Por presupuesto del plan
  if (task.planCode === 'free') return { model: 'gemini-2.5-flash', maxTokens: 1000 };
  if (task.planCode === 'start') return { model: 'gemini-2.5-flash', maxTokens: 2000 };
  
  // Default
  return { model: 'gemini-2.5-pro', maxTokens: 4000 };
}
```

---

## 3. FALLBACK CHAIN

```
Solicitud al Orchestrator
      ↓
gemini-2.5-pro (primario)
      ↓ si timeout (>30s) o error 5xx
meta/llama-3.3-70b-instruct (NVIDIA NIM — fallback 1)
      ↓ si error
gemini-2.5-flash (respuesta degradada pero disponible — fallback 2)
      ↓ si error
Error controlado → "El servicio de IA no está disponible temporalmente"
```

**Regla:** El fallback nunca se registra como éxito si degradó la calidad. Se registra `model_fallback: true` en `ai_usage`.

---

## 4. LÍMITES POR PLAN

| Plan | Tokens/mes | Modelos disponibles | Agentes disponibles |
|---|---|---|---|
| Free | 0 (sin IA) | — | — |
| Start | 50k tokens | Flash solamente | Asistente básico |
| Growth | 500k tokens | Flash + Pro | 3 agentes |
| Business OS | 5M tokens | Flash + Pro + embedding | Todos los agentes |
| Enterprise OS | Ilimitado* | Todos | Todos + custom |

*Con rate limiting para prevenir abuso.

---

## 5. MÉTRICAS DE MODELO

Las siguientes métricas se registran en `ai_usage` por cada invocación:

```typescript
interface AIUsageRecord {
  company_id: string;
  user_id: string;
  agent_id: string;
  model: string;                   // ID exacto del modelo
  provider: 'gemini' | 'nvidia';
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;      // Calculado en el Orchestrator
  latency_ms: number;
  prompt_version_id: string;
  model_fallback: boolean;         // true si se usó fallback
  error?: string;                  // Si hubo error
  created_at: string;
}
```

---

## 6. MODELO PARA CADA CASO DE USO

| Caso de Uso | Modelo | Justificación |
|---|---|---|
| Análisis de pipeline comercial | `gemini-2.5-pro` | Necesita razonamiento multi-paso |
| Clasificación de tickets | `gemini-2.5-flash` | Tarea simple, costo mínimo |
| Resumen ejecutivo financiero | `gemini-2.5-pro` | Análisis numérico complejo |
| Respuesta de chat rápido | `gemini-2.5-flash` | Latencia baja crítica |
| Revisión de contrato | `gemini-2.5-pro` | Análisis legal requiere máxima capacidad |
| Detección de anomalías BI | `gemini-2.5-pro` | Correlaciones complejas |
| Output validation | `gemini-2.5-flash` | Clasificación simple, costo mínimo |
| Memory embedding | `text-embedding-004` | Optimizado para vectorización |
| Clasificación de sentimiento (reviews) | `gemini-2.5-flash` | Tarea simple |
| Generación de reportes largos | `gemini-2.5-pro` | Ventana de contexto grande necesaria |

---

## 7. PROCESO PARA AÑADIR NUEVO MODELO

1. Añadir el modelo a este catálogo con sus características
2. Implementar en `_shared/orchestrator.ts` el provider si es nuevo
3. Crear ADR documentando la decisión (por qué este modelo, costo-beneficio)
4. Test de calidad: comparar outputs con el modelo actual en mismos prompts
5. Test de seguridad: verificar que el modelo respeta las instrucciones de sistema
6. Habilitar via feature flag para un % de tráfico antes de full rollout
7. Monitorear métricas de calidad y costo por 1 sprint antes de promover a default

---

## 8. PROVIDER KEYS

Todos los API keys de modelos IA viven como secrets de Edge Functions:
- `GEMINI_API_KEY` → Supabase secret, solo accesible en `ai-proxy`
- `NVIDIA_API_KEY` → Supabase secret, solo accesible en `ai-proxy`
- **NUNCA** en variables `VITE_*`
- **NUNCA** en el frontend
- Rotación: revisar y rotar cada 90 días

---

*Ver: `18_AI_GOVERNANCE.md` sección 5 para política de modelos*
*Ver: `supabase/functions/_shared/orchestrator.ts` para implementación actual*
*Ver: `docs/architecture/AI_PLATFORM_REPORT.md` para análisis histórico de proveedores*
