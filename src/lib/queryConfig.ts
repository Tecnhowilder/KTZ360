/**
 * queryConfig — Constantes de caché para React Query.
 *
 * Estrategia por capa:
 *   AUTH     5min  — profile, workspace, plan cambian raramente
 *   BUSINESS 30s   — cotizaciones, pedidos, clientes: datos operativos
 *   REALTIME 0s    — datos actualizados por Realtime; no necesitan staleTime
 *   AI       5min  — créditos IA: se actualizan en cada uso
 *   STATIC   10min — catálogo, materiales, templates: cambian poco
 *   BI       5min  — dashboards financieros y BI: costo alto, refresh tolerable
 */

export const STALE = {
  AUTH:     5  * 60_000,   // 5 minutos
  BUSINESS: 30_000,        // 30 segundos
  REALTIME: 0,             // siempre fresco (Realtime lo actualiza)
  AI:       5  * 60_000,   // 5 minutos
  STATIC:   10 * 60_000,   // 10 minutos
  BI:       5  * 60_000,   // 5 minutos
  INSTANT:  0,             // para datos críticos sin cache
} as const;

export const GC = {
  SHORT:  2  * 60_000,   // 2 minutos
  NORMAL: 5  * 60_000,   // 5 minutos (default)
  LONG:   30 * 60_000,   // 30 minutos (para datos estáticos)
} as const;

/**
 * SLO targets — usados en dashboard de observabilidad
 * para validar que se cumplen los objetivos de rendimiento.
 */
export const SLO = {
  AVAILABILITY:         99.9,    // %
  INITIAL_LOAD_MS:      3_000,   // ms — tiempo de carga inicial en 4G
  API_LATENCY_P95_MS:   300,     // ms — latencia P95 de RPCs
  AI_RESPONSE_P95_MS:   8_000,   // ms — tiempo generación IA P95
  EF_ERROR_RATE_MAX:    0.5,     // % — tasa de error en Edge Functions
  RECOVERY_TIME_MS:     15 * 60 * 1_000, // 15 minutos — MTTR ante fallo crítico
} as const;
