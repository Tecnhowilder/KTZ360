# PERMISSION MATRIX — SHELWI OS
> Versión: 0.1 (stub — formalizar en Sprint 0/1) | Fecha: 2026-07-14
> Implementación actual: `src/hooks/usePermissions.ts` + `src/lib/permissions.ts`

---

## 1. ROLES DEL SISTEMA

| Rol | Código | Nivel | Descripción |
|---|---|---|---|
| Propietario | `owner` | 6 | Tiene control total del workspace. Solo 1 por workspace. |
| Administrador | `admin` | 5 | Gestiona todo excepto eliminar workspace o cambiar owner. |
| Gerente | `manager` | 4 | Gestiona su departamento asignado + ve reportes. |
| Miembro | `member` | 3 | Trabaja con sus datos y datos compartidos. |
| Visualizador | `viewer` | 2 | Solo lectura. No puede crear ni modificar. |
| Invitado | `guest` | 1 | Acceso temporal limitado. TTL configurable. |
| Superadmin | `superadmin` | 7 | Solo para Shelwi staff. Accede via AdminPanel. |

---

## 2. MATRIZ DE PERMISOS POR MÓDULO

### Leyenda
- ✅ Permitido sin restricciones
- 🔑 Permitido solo sobre sus propios datos
- ⚙️ Permitido si feature habilitada para el workspace
- ❌ Prohibido
- [rol] Solo para ese rol o superior

### CRM

| Acción | owner | admin | manager | member | viewer | guest |
|---|---|---|---|---|---|---|
| Ver lista de clientes | ✅ | ✅ | ✅ | ✅⚙️ | ✅⚙️ | ❌ |
| Ver detalle de cliente | ✅ | ✅ | ✅ | 🔑 | 🔑 | ❌ |
| Crear cliente | ✅ | ✅ | ✅ | ✅⚙️ | ❌ | ❌ |
| Editar cliente | ✅ | ✅ | ✅ | 🔑 | ❌ | ❌ |
| Eliminar cliente (soft) | ✅ | ✅ | [manager] | ❌ | ❌ | ❌ |
| Ver oportunidades | ✅ | ✅ | ✅ | 🔑 | ✅⚙️ | ❌ |
| Crear/editar oportunidades | ✅ | ✅ | ✅ | 🔑 | ❌ | ❌ |
| Generar cotización | ✅ | ✅ | ✅ | ✅⚙️ | ❌ | ❌ |
| Exportar clientes | ✅ | ✅ | [manager] | ❌ | ❌ | ❌ |

### Finanzas

| Acción | owner | admin | manager | member | viewer | guest |
|---|---|---|---|---|---|---|
| Ver facturas | ✅ | ✅ | ✅⚙️ | 🔑⚙️ | ✅⚙️ | ❌ |
| Crear factura | ✅ | ✅ | [admin] | ❌ | ❌ | ❌ |
| Registrar pago | ✅ | ✅ | [admin] | ❌ | ❌ | ❌ |
| Ver reportes financieros | ✅ | ✅ | ✅⚙️ | ❌ | ❌ | ❌ |
| Exportar datos financieros | ✅ | ✅ | [admin] | ❌ | ❌ | ❌ |
| Modificar métodos de pago | ✅ | [owner] | ❌ | ❌ | ❌ | ❌ |

### Operaciones / Tareas

| Acción | owner | admin | manager | member | viewer | guest |
|---|---|---|---|---|---|---|
| Ver tareas | ✅ | ✅ | ✅ | ✅ | ✅ | ⚙️ |
| Crear tarea | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar tarea propia | ✅ | ✅ | ✅ | 🔑 | ❌ | ❌ |
| Editar tarea de otro | ✅ | ✅ | [manager] | ❌ | ❌ | ❌ |
| Asignar tarea | ✅ | ✅ | [manager] | ❌ | ❌ | ❌ |
| Eliminar tarea | ✅ | ✅ | [manager] | ❌ | ❌ | ❌ |
| Ver proyectos | ✅ | ✅ | ✅ | ✅ | ✅ | ⚙️ |
| Crear proyecto | ✅ | ✅ | [manager] | ❌ | ❌ | ❌ |
| Actualizar proyecto | ✅ | ✅ | [manager] | 🔑⚙️ | ❌ | ❌ |

### RRHH

| Acción | owner | admin | manager | member | viewer | guest |
|---|---|---|---|---|---|---|
| Ver empleados | ✅ | ✅ | ✅⚙️ | 🔑 | ❌ | ❌ |
| Crear empleado | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Editar empleado | ✅ | ✅ | [manager] | ❌ | ❌ | ❌ |
| Ver evaluaciones | ✅ | ✅ | [manager] | 🔑 | ❌ | ❌ |
| Crear evaluación | ✅ | ✅ | [manager] | ❌ | ❌ | ❌ |
| Gestionar ausencias | ✅ | ✅ | [manager] | 🔑 | ❌ | ❌ |
| Ver sueldos | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Configuración del Workspace

| Acción | owner | admin | manager | member | viewer | guest |
|---|---|---|---|---|---|---|
| Ver configuración | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Editar nombre/logo | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gestionar miembros | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invitar miembro | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cambiar rol de miembro | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Eliminar miembro | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver feature flags | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cambiar feature flags | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver plan / suscripción | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cambiar plan | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Eliminar workspace | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Agentes IA

| Acción | owner | admin | manager | member | viewer | guest |
|---|---|---|---|---|---|---|
| Usar agente (chat) | ✅ | ✅ | ✅⚙️ | ✅⚙️ | ❌ | ❌ |
| Ver historial de agente | ✅ | ✅ | [manager] | 🔑 | ❌ | ❌ |
| Aprobar acción de agente | ✅ | ✅ | [manager] | ❌ | ❌ | ❌ |
| Configurar Policy de agente | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver métricas de uso IA | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Auditoría

| Acción | owner | admin | manager | member | viewer | guest |
|---|---|---|---|---|---|---|
| Ver audit log (propio) | ✅ | ✅ | ✅ | 🔑 | ❌ | ❌ |
| Ver audit log (todos) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Exportar audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 3. FEATURE FLAGS POR PLAN

Los feature flags controlan qué módulos están habilitados por plan.
La verificación se hace via `useFeatureAccess(feature)` — nunca hardcoding de plan.

| Feature Key | Free | Start | Growth | Business OS | Enterprise OS |
|---|---|---|---|---|---|
| `crm_access` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tasks_access` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `quotes_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `invoicing_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `payments_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `reports_access` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `projects_access` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `hr_access` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `hr_evaluations` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `hr_leaves` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `ai_agents` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `ai_autonomous` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `custom_workflows` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `api_access` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `white_label` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `sso` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `audit_export` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `team_management` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace_settings` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `feature_flags_admin` | ❌ | ❌ | ❌ | ✅ | ✅ |

**Nota:** Los nombres de planes (Start, Growth, Business OS, Enterprise OS) son los nombres nuevos.
El código actualmente usa `free`, `pro`, `premium`, `enterprise` — migration pendiente en Sprint 1.

---

## 4. IMPLEMENTACIÓN

### Frontend (ya implementado)
```typescript
// Verificar feature
const { canUse } = useFeatureAccess('reports_access');

// Verificar rol
const { hasPermission } = usePermission('create_invoice');
```

### Backend / Edge Functions
```typescript
// Verificar desde Edge Function
const hasAccess = await checkFeatureAccess(workspaceId, 'reports_access');
```

### Agentes IA
- Los agentes NO verifican permisos del usuario directamente
- El Tool Registry verifica que el agente tiene permiso para el Tool
- El Tool verifica que la empresa tiene acceso a la feature
- La acción se registra con el `user_id` del agente que disparó el flujo

---

## 5. ABAC (Futuro — Fase 6)

Cuando el Policy Engine esté implementado, añadir permisos basados en atributos:
- `solo_mis_clientes`: un member solo ve clientes que creó él
- `solo_mi_departamento`: un manager solo ve datos de su departamento
- `monto_limite`: un manager puede aprobar facturas hasta $X definido en su perfil
- `solo_lectura_post_fecha`: datos históricos de X fecha son solo lectura para member

Estos atributos se configuran en BD, no en código.
