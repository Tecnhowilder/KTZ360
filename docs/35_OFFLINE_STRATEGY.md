# OFFLINE STRATEGY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Arquitectura de operación offline y sincronización
> Implementación: `src/lib/offlineDB.ts` (Dexie 4) + Capacitor 8

---

## 1. CONTEXTO Y NECESIDAD

Los técnicos de campo en LATAM trabajan en zonas con conectividad intermitente (construcciones, zonas rurales, bodegas sin WiFi). Las acciones críticas de campo deben funcionar sin conexión:

- Registro de GPS (check-in / check-out)
- Subir evidencias (fotos, documentos)
- Ver tareas asignadas
- Marcar tareas como completadas
- Crear notas

---

## 2. ARQUITECTURA OFFLINE

```
ONLINE:  [Supabase DB] ←→ [TanStack Query Cache] ←→ [Componente]
                                   ↕ sync
OFFLINE: [IndexedDB / Dexie]      ←→ [Componente]
                                   ↕ sync cuando hay red
ONLINE:  [Supabase DB] ←→ [Supabase Realtime] (reconciliación)
```

### 2.1 Dexie como base de datos offline

`src/lib/offlineDB.ts` define el schema de IndexedDB:

```typescript
import Dexie, { type Table } from 'dexie';

export class OfflineDB extends Dexie {
  tasks!: Table<OfflineTask>;
  gpsEvents!: Table<OfflineGPSEvent>;
  evidences!: Table<OfflineEvidence>;
  pendingSync!: Table<PendingSyncItem>;

  constructor() {
    super('ShelwiOfflineDB');
    this.version(1).stores({
      tasks:       'id, company_id, assignee_id, status, due_date, synced_at',
      gpsEvents:   'id, company_id, employee_id, type, created_at, synced_at',
      evidences:   'id, company_id, task_id, created_at, synced_at',
      pendingSync: '++id, entity_type, entity_id, action, created_at',
    });
  }
}

export const offlineDB = new OfflineDB();
```

---

## 3. DATOS QUE SE ALMACENAN OFFLINE

### 3.1 Cacheados para lectura offline

| Dato | TTL local | Actualizado |
|---|---|---|
| Tareas asignadas al usuario | 24h | Al abrir app / pull-to-refresh |
| Lista de clientes activos | 12h | Al abrir módulo CRM |
| Catálogo de productos | 24h | Al abrir módulo Catálogo |
| Proyectos activos | 24h | Al abrir Operaciones |
| Datos del workspace (settings) | 7d | Al hacer login |

### 3.2 Creados offline (pending sync)

| Acción | Cómo se sincroniza |
|---|---|
| GPS check-in / check-out | Al recuperar red: `sync_gps_events()` RPC |
| Subir evidencia (fotos) | Al recuperar red: upload a Storage + actualizar DB |
| Marcar tarea completada | Al recuperar red: UPDATE tasks via RPC |
| Agregar nota a tarea | Al recuperar red: INSERT en task_comments |

---

## 4. FLUJO DE SINCRONIZACIÓN

```typescript
// Detectar estado de red (Capacitor + browser)
import { Network } from '@capacitor/network';

Network.addListener('networkStatusChange', async (status) => {
  if (status.connected) {
    await syncPendingItems();
  }
});

// Al recuperar red: procesar cola de sincronización
async function syncPendingItems() {
  const pending = await offlineDB.pendingSync
    .orderBy('created_at')
    .toArray();

  for (const item of pending) {
    try {
      await processSyncItem(item);
      await offlineDB.pendingSync.delete(item.id);
    } catch (error) {
      // Marcar como error, reintentar en próxima sincronización
      await offlineDB.pendingSync.update(item.id, {
        error: String(error),
        retry_count: (item.retry_count ?? 0) + 1,
      });
    }
  }
}
```

---

## 5. CONFLICTOS DE SINCRONIZACIÓN

### 5.1 Estrategia: Last Write Wins

Para la mayoría de las entidades, si hay un conflicto entre la versión offline y la versión en Supabase, la versión más reciente (por `updated_at`) gana.

```typescript
async function syncTask(offlineTask: OfflineTask) {
  const { data: serverTask } = await supabase
    .from('tasks')
    .select('updated_at, status')
    .eq('id', offlineTask.id)
    .single();

  if (!serverTask || offlineTask.updated_at > serverTask.updated_at) {
    // La versión offline es más nueva → aplicar al servidor
    await supabase.from('tasks').update({
      status: offlineTask.status,
      updated_at: offlineTask.updated_at,
    }).eq('id', offlineTask.id);
  }
  // Si la del servidor es más nueva → descartar la versión offline
}
```

### 5.2 Excepciones (no hay conflicto posible)

| Entidad | Razón |
|---|---|
| GPS events | Solo INSERT, nunca se modifican |
| Evidencias | Solo INSERT (subir foto) |
| Audit log | Solo INSERT, inmutable |

---

## 6. INDICADORES DE ESTADO OFFLINE EN UI

```typescript
// Hook para estado de conectividad
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const checkPending = async () => {
      const count = await offlineDB.pendingSync.count();
      setPendingCount(count);
    };
    checkPending();
    // ... listener de red
  }, []);

  return { isOnline, pendingCount };
}

// En UI:
function SyncStatus() {
  const { isOnline, pendingCount } = useNetworkStatus();

  if (!isOnline) return <Badge variant="warning">Sin conexión — {pendingCount} pendientes</Badge>;
  if (pendingCount > 0) return <Badge variant="info">Sincronizando {pendingCount} elementos...</Badge>;
  return null;
}
```

---

## 7. MÓDULOS CON SOPORTE OFFLINE

| Módulo | Offline read | Offline write | Sync automático |
|---|---|---|---|
| Mis tareas | ✅ | ✅ (completar) | ✅ |
| GPS Check-in/out | N/A | ✅ | ✅ |
| Evidencias de campo | ✅ (en caché) | ✅ (encolar) | ✅ |
| CRM — Clientes | ✅ (lista) | ❌ | N/A |
| Finanzas | ✅ (lista) | ❌ | N/A |
| AI Studio | ❌ | ❌ | N/A |
| Dashboard | ❌ (requiere DB) | N/A | N/A |

---

## 8. SCHEMA DE DEXIE — VERSIONING

```typescript
// Regla crítica: las versiones de Dexie son acumulativas
// Siempre agregar una nueva versión, NUNCA modificar la versión 1

this.version(2).stores({
  // Nueva tabla en v2
  pendingSync: '++id, entity_type, entity_id, action, created_at',
}).upgrade(tx => {
  // Migración de datos de v1 a v2 si necesario
});
```

---

*Ver: `docs/01_ARCHITECTURE_CONSTITUTION.md` Artículo VII — Mobile First*
*Ver: `src/lib/offlineDB.ts` para implementación actual*
*Ver: `docs/25_PLATFORM_STABILITY_GUIDE.md` para cuidados al actualizar Dexie*
