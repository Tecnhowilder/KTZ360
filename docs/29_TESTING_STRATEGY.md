# TESTING STRATEGY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Estrategia de pruebas para garantizar calidad y estabilidad
> Estado actual: Tests no configurados — este documento es la estrategia objetivo

---

## 1. PIRÁMIDE DE TESTING

```
          /  E2E (Playwright)  \      — Pocos, lentos, críticos
         /  Integration Tests  \      — Moderados, foco en flujos
        /    Unit Tests         \     — Muchos, rápidos, módulos aislados
       /   Type Checking (tsc)   \   — Siempre activo, tiempo real
```

**Estado actual:** Solo type checking activo. Tests unitarios e integration son deuda técnica (TD-CI-01).

---

## 2. TYPE CHECKING — PRIMERA LÍNEA

TypeScript strict mode es la primera capa de "testing":

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

```bash
# Verificar antes de cada PR
npx tsc --noEmit
```

---

## 3. TESTS UNITARIOS (objetivo: Vitest)

### 3.1 Qué testear con unit tests

```
✅ Lógica de negocio pura (funciones sin side effects)
✅ Formateo y transformación de datos
✅ Validación de inputs
✅ Cálculos (totales de cotizaciones, métricas de KPIs)
✅ Hooks de React (useFeatureAccess, useWorkspace, etc.)
✅ RPCs SQL via funciones helper

❌ No testear implementación de UI (demasiado frágil)
❌ No mockear la DB — preferir integration tests para lógica con DB
```

### 3.2 Setup objetivo

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

### 3.3 Ejemplos de tests críticos a implementar

```typescript
// src/lib/__tests__/invoice.test.ts
describe('calculateInvoiceTotal', () => {
  it('suma correctamente items con tax_percent diferente', () => {
    const items = [
      { quantity: 2, unit_price: 100, tax_percent: 19 },
      { quantity: 1, unit_price: 50, tax_percent: 0 },
    ];
    const result = calculateInvoiceTotal(items);
    expect(result.subtotal).toBe(250);
    expect(result.tax_total).toBe(38); // 19% de 200
    expect(result.grand_total).toBe(288);
  });
});

// src/hooks/__tests__/useFeatureAccess.test.ts
describe('useFeatureAccess', () => {
  it('devuelve hasAccess=false cuando feature no está en plan', () => {
    const mockPlanFeatures = [{ feature_key: 'crm_access', enabled: true }];
    const { result } = renderHook(() => useFeatureAccess('reports_access'), {
      wrapper: MockPlanProvider(mockPlanFeatures),
    });
    expect(result.current.hasAccess).toBe(false);
  });
});
```

---

## 4. INTEGRATION TESTS (objetivo)

### 4.1 Qué testear con integration tests

```
✅ Flujos completos de Supabase RPC (con DB real de test)
✅ Edge Functions (con supabase local o staging)
✅ Integración entre hooks y servicios
✅ Multi-tenancy (verificar que empresa A no ve datos de empresa B)
✅ RLS policies (verificar que los roles tienen los permisos correctos)
```

### 4.2 Setup de DB de test

```bash
# Usar supabase local para integration tests
supabase start  # Levanta Postgres + Auth + Storage localmente

# Variables de entorno para tests
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_KEY=<local-service-key>
```

### 4.3 Tests RLS críticos a implementar

```typescript
// Verificar que company A no puede leer datos de company B
describe('RLS: clients table', () => {
  it('usuario de empresa A no puede ver clientes de empresa B', async () => {
    const clientA = await supabaseA.from('clients').select('*');
    const clientB = await supabaseA.from('clients').select('*')
      .eq('company_id', COMPANY_B_ID);  // debería devolver []

    expect(clientB.data).toHaveLength(0);
    expect(clientB.error).toBeNull();  // No error, simplemente vacío (RLS)
  });
});
```

---

## 5. E2E TESTS (objetivo: Playwright — FASE 5+)

### 5.1 Flujos críticos a cubrir con E2E

```
1. Registro de empresa + onboarding completo
2. Crear cliente → cotización → orden → factura → pago
3. Login → invitar miembro → aceptar invitación
4. Crear automatización → trigger → verificar ejecución
5. Conectar integración Alegra → crear factura → verificar sync
6. Mobile: Check-in GPS → subir evidencia → check-out
```

### 5.2 Estrategia de datos de test

```typescript
// seed-data.ts — datos de prueba reproducibles
const TEST_COMPANY = {
  name: 'Empresa Test',
  email: 'test+e2e@shelwi.com',
  plan: 'growth',
};

// Cleanup después de cada test
afterEach(async () => {
  await cleanupTestData(TEST_COMPANY.id);
});
```

---

## 6. COBERTURA OBJETIVO

| Capa | Cobertura mínima objetivo | Fase |
|---|---|---|
| Funciones de lógica de negocio | 80% | FASE 2 |
| Hooks críticos (feature access, workspace) | 90% | FASE 2 |
| RLS policies (críticas) | 100% de happy + deny paths | FASE 3 |
| Edge Functions (ai-proxy, mp-webhook) | 70% integration | FASE 3 |
| E2E flujos core | 5 flujos | FASE 5 |

---

## 7. POLÍTICA DE TESTS PARA NUEVAS FEATURES

A partir de FASE 2, toda nueva feature debe incluir:
- Tests unitarios para lógica de negocio no trivial
- Test de integración para flujo happy path si involucra DB
- Si modifica RLS: test que verifica el deny path

El PR no se mergea si los tests fallan (cuando CI esté configurado).

---

*Ver: `docs/28_CICD_PIPELINE.md` para integración de tests en el pipeline*
*Ver: `docs/23_CODING_STANDARDS.md` para convenciones de código en tests*
