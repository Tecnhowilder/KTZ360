# PERFORMANCE BUDGET — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Presupuesto de performance para frontend y backend

---

## 1. CONTEXT: USUARIOS EN LATAM

El 70%+ del tráfico de Shelwi es desde dispositivos móviles con conexión 4G en LATAM. La velocidad promedio de descarga en LATAM es ~15-25 Mbps. Los dispositivos tienen hardware moderado (4GB RAM, CPU mid-range).

---

## 2. PRESUPUESTO FRONTEND

### 2.1 Bundle JavaScript

| Artefacto | Budget | Límite absoluto |
|---|---|---|
| JS principal (gzip) | < 250 KB | 350 KB |
| CSS (gzip) | < 30 KB | 50 KB |
| Imágenes por página | < 500 KB | 1 MB |
| Fuentes web | < 100 KB | 150 KB |
| Total página inicial | < 1 MB | 1.5 MB |

**Verificar con:**
```bash
npm run build && npx vite-bundle-visualizer
```

### 2.2 Core Web Vitals (P75 en 4G móvil)

| Métrica | Good | Needs Improvement | Poor |
|---|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5s | 2.5-4s | > 4s |
| FID / INP | < 100ms | 100-300ms | > 300ms |
| CLS | < 0.1 | 0.1-0.25 | > 0.25 |
| TTFB | < 800ms | 800ms-1.8s | > 1.8s |

**Nuestros targets para Shelwi:**

| Métrica | Target (P75 4G) | Crítico si supera |
|---|---|---|
| LCP | < 2.5s | 3.5s |
| INP | < 100ms | 200ms |
| CLS | < 0.1 | 0.15 |
| TTI | < 4s | 6s |
| FCP | < 1.8s | 3s |

### 2.3 Tiempos de interacción

| Interacción | Target | Crítico |
|---|---|---|
| Lista de clientes (50 items) | < 300ms | 600ms |
| Abrir modal de nueva cotización | < 200ms | 400ms |
| Guardar cotización | < 800ms (incl. DB) | 1.5s |
| Cargar dashboard | < 2s | 4s |
| Búsqueda en tiempo real | < 300ms (debounced) | 500ms |
| Generar reporte PDF | < 5s | 10s |
| Respuesta de AI Studio | < 5s (streaming) | 15s |

---

## 3. PRESUPUESTO BACKEND

### 3.1 Supabase RPCs y queries

| Operación | Target P50 | Target P95 | Crítico |
|---|---|---|---|
| SELECT simple (filtro + límite) | < 20ms | < 50ms | 100ms |
| SELECT con JOINs (2-3 tablas) | < 50ms | < 100ms | 200ms |
| INSERT/UPDATE | < 30ms | < 80ms | 150ms |
| RPC SECURITY DEFINER (simple) | < 50ms | < 100ms | 200ms |
| Dashboard metrics RPC | < 200ms | < 500ms | 1s |

### 3.2 Edge Functions

| Función | Target P50 | Target P95 | Crítico |
|---|---|---|---|
| Non-AI functions (create-checkout, etc.) | < 200ms | < 500ms | 1s |
| ai-proxy (solo routing) | < 300ms | < 800ms | 2s |
| ai-proxy (con LLM call) | < 2s | < 5s | 10s |
| send-email | < 500ms | < 1.5s | 3s |
| generate-report | < 3s | < 8s | 15s |

---

## 4. ESTRATEGIAS PARA CUMPLIR EL PRESUPUESTO

### 4.1 Code splitting

```typescript
// ✅ Lazy loading de módulos pesados
const AIStudio = lazy(() => import('@/features/aiStudio/AIStudio'));
const Reports = lazy(() => import('@/features/reports/Reports'));

// ✅ Route-based splitting via React Router
{
  path: '/app/ai-studio',
  element: <Suspense fallback={<LoadingScreen />}><AIStudio /></Suspense>
}
```

### 4.2 Imágenes

```typescript
// ✅ Lazy loading de imágenes
<img loading="lazy" src={avatarUrl} alt="Avatar" />

// ✅ Reducir tamaño antes de subir a Storage
// (implementar en upload de evidencias y logos)
import Compressor from 'compressorjs';
new Compressor(file, { quality: 0.8, maxWidth: 1280 });
```

### 4.3 Queries de DB

```sql
-- ✅ Usar SELECT específico (no SELECT *)
SELECT id, name, email, status FROM clients WHERE company_id = $1 LIMIT 50;

-- ✅ Índices en columnas de filtro frecuente
CREATE INDEX idx_tasks_status ON tasks(company_id, status) WHERE deleted_at IS NULL;

-- ✅ EXPLAIN ANALYZE para queries lentas
EXPLAIN ANALYZE SELECT * FROM quotes WHERE company_id = $1 ORDER BY created_at DESC;
```

### 4.4 Frontend caching

```typescript
// ✅ staleTime apropiado para evitar re-fetches innecesarios
const { data: planFeatures } = useQuery({
  queryKey: ['plan-features', planCode],
  queryFn: () => fetchPlanFeatures(planCode),
  staleTime: 30 * 60 * 1000,  // 30 min — cambia raramente
  gcTime: 60 * 60 * 1000,     // 1 hora en caché
});
```

---

## 5. HERRAMIENTAS DE MEDICIÓN

| Herramienta | Qué mide | Frecuencia |
|---|---|---|
| Lighthouse (Chrome DevTools) | Core Web Vitals en staging | Por release |
| Sentry Performance | RUM en producción (P75 real) | Continuo |
| Supabase Dashboard | Latencia de queries | Continuo |
| `vite-bundle-visualizer` | Composición del bundle | Por release |
| `npx tsc --noEmit` | Errores de tipo (no performance pero sí calidad) | Por PR |

---

## 6. ALERTA DE REGRESIÓN

Si en una revisión post-release se detecta alguna de estas regresiones:

| Regresión | Acción |
|---|---|
| Bundle JS > 350 KB | Analizar con `vite-bundle-visualizer`, eliminar dependencia o añadir code splitting |
| LCP > 3.5s | Revisar imágenes sin optimizar, JS blockeante, TTFB alto |
| Query > 500ms en P95 | `EXPLAIN ANALYZE`, añadir índice |
| Edge Function > 2s (no-AI) | Revisar N+1 queries, optimizar payload |

---

*Ver: `docs/21_OBSERVABILITY_GUIDE.md` para monitoreo continuo*
*Ver: `docs/25_PLATFORM_STABILITY_GUIDE.md` para reglas de estabilidad*
*Ver: `docs/24_UX_CONSTITUTION.md` sección 8 para performance UX targets*
