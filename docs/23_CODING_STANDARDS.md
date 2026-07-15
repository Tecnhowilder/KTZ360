# CODING STANDARDS — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Convenciones de código para mantener consistencia y calidad
> Stack: TypeScript + React 19 + Vite 8 + Tailwind v3 + Supabase

---

## 1. TYPESCRIPT

### 1.1 Tipos estrictos — siempre

```typescript
// ✅ Correcto
function createClient(workspaceId: string, userId: string): Promise<Client> {}

// ❌ Incorrecto
function createClient(workspaceId: any, userId: any): Promise<any> {}
```

### 1.2 Tipos de la base de datos

Usar los tipos generados de `src/lib/database.types.ts` — nunca escribir tipos de tabla manualmente:

```typescript
import type { Database } from '@/lib/database.types';
type Client = Database['public']['Tables']['clients']['Row'];
type ClientInsert = Database['public']['Tables']['clients']['Insert'];
```

### 1.3 Tipos de respuesta de Supabase

```typescript
// ✅ Destructurar siempre { data, error }
const { data: client, error } = await supabase
  .from('clients')
  .select('*')
  .eq('id', clientId)
  .single();

if (error) throw error;
```

---

## 2. REACT

### 2.1 Componentes funcionales — siempre

No usar class components. Solo functional components + hooks.

### 2.2 Naming

```typescript
// Componentes: PascalCase
export function ClientCard() {}
export function QuoteListItem() {}

// Hooks: camelCase con prefijo 'use'
export function useClients() {}
export function useFeatureAccess() {}

// Services/utils: camelCase
export function formatCurrency() {}
export const crmService = {}
```

### 2.3 Props: siempre tipar explícitamente

```typescript
// ✅
interface ClientCardProps {
  clientId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function ClientCard({ clientId, onSelect, className }: ClientCardProps) {}
```

### 2.4 Evitar re-renders innecesarios

```typescript
// Usar useCallback para handlers
const handleSubmit = useCallback(async (data: FormData) => {
  await createClient(data);
}, [createClient]);

// Usar useMemo para computaciones costosas
const sortedClients = useMemo(
  () => clients.sort((a, b) => a.name.localeCompare(b.name)),
  [clients]
);
```

---

## 3. ESTADO Y DATA FETCHING

### 3.1 TanStack Query para datos del servidor

```typescript
// ✅ Usar TanStack Query para fetching + caching
const { data: clients, isLoading } = useQuery({
  queryKey: ['clients', workspaceId],
  queryFn: () => crmService.getClients(workspaceId),
  staleTime: 5 * 60 * 1000, // 5 minutos
});

// Mutaciones con invalidación
const createClientMutation = useMutation({
  mutationFn: crmService.createClient,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  },
});
```

### 3.2 Estado local solo para UI state

```typescript
// ✅ Estado local = UI (modal open, form dirty, etc.)
const [isModalOpen, setIsModalOpen] = useState(false);
const [selectedTab, setSelectedTab] = useState<'details' | 'history'>('details');

// ❌ No guardar datos del servidor en useState
const [clients, setClients] = useState([]); // Usar useQuery en su lugar
```

---

## 4. ESTRUCTURA DE CARPETAS

```
src/
  components/     # Componentes UI reutilizables (sin lógica de negocio)
    ui/           # Primitivos shadcn/ui
    shared/       # Componentes compartidos entre features
  features/       # Features por dominio (cada una autocontenida)
    crm/
      components/ # Componentes específicos del CRM
      hooks/      # Hooks del CRM
      services/   # Llamadas a Supabase del CRM
    finance/
    operations/
    hr/
    aiStudio/
    app/          # Auth, layout, routing
  services/       # Servicios cross-cutting (sin dominio específico)
  lib/            # Utils, types, configuración
    database.types.ts
    supabase.ts
  hooks/          # Hooks globales (useFeatureAccess, useWorkspace, etc.)
```

---

## 5. NAMING DE QUERY KEYS

```typescript
// Convención: ['entidad', workspaceId?, filtros?]
queryKey: ['clients', workspaceId]
queryKey: ['clients', workspaceId, { status: 'active' }]
queryKey: ['quotes', workspaceId, clientId]
queryKey: ['quote', quoteId]  // singular = registro específico
queryKey: ['invoices', workspaceId, { period: 'month' }]
```

---

## 6. MANEJO DE ERRORES

```typescript
// En servicios: throw errores claros
async function createClient(data: ClientInsert) {
  const { data: client, error } = await supabase.from('clients').insert(data).single();
  if (error) throw new Error(`Failed to create client: ${error.message}`);
  return client;
}

// En hooks: usar error boundary o estado de error local
const { data, error, isError } = useQuery({ ... });
if (isError) return <ErrorMessage message={error.message} />;

// En Edge Functions: respuesta con código HTTP correcto
return new Response(JSON.stringify({ error: 'client_not_found' }), { status: 404 });
```

---

## 7. FEATURE FLAGS

```typescript
// ✅ SIEMPRE usar hooks de feature access — nunca hardcodear plan
import { useFeatureAccess } from '@/hooks/useFeatureAccess';

function ReportsButton() {
  const { hasAccess } = useFeatureAccess('reports_access');
  if (!hasAccess) return <UpgradePrompt feature="reports" />;
  return <Button>Generar Reporte</Button>;
}

// ❌ PROHIBIDO — hardcodear plan
if (plan === 'premium') { ... }  // violación de Architecture Constitution Art. IV
```

---

## 8. MULTI-TENANCY

```typescript
// ✅ workspace_id siempre desde contexto autenticado
const { workspaceId } = useWorkspace();  // hook que lee del JWT/profile

// ❌ Nunca del input del usuario
const workspaceId = searchParams.get('workspace_id');  // riesgo de tenant leakage
```

---

## 9. INTERNACIONALIZACIÓN

Shelwi está orientado a LATAM. Convenciones:
- Fechas: formato `DD/MM/YYYY` por defecto (configurable por empresa)
- Moneda: respetar la moneda del workspace (`workspace.settings.currency`)
- Idioma: español por defecto, inglés en código/variables/tipos

```typescript
// Formateo de moneda
const formattedAmount = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: workspace.settings.currency ?? 'USD',
}).format(amount);
```

---

## 10. COMENTARIOS EN CÓDIGO

- Código auto-descriptivo con nombres claros > comentarios explicando "qué"
- Comentar SOLO el "por qué" cuando no es obvio
- No comentar código desactivado — usar git para historial

```typescript
// ✅ Comentario útil — explica restricción no obvia
// company_id desnormalizado aquí para que RLS funcione sin join a quotes
const { data } = await supabase.from('quote_items').select('*').eq('company_id', workspaceId);

// ❌ Comentario inútil — el código ya lo dice
// Obtener todos los clientes activos
const clients = await getActiveClients();
```

---

*Ver: `docs/01_ARCHITECTURE_CONSTITUTION.md` para principios arquitectónicos*
*Ver: `docs/24_UX_CONSTITUTION.md` para estándares de UI*
*Ver: `docs/26_BRANCH_STRATEGY.md` para convenciones de git*
