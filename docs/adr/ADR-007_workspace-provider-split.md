# ADR-007 — Split de WorkspaceProvider en sub-providers especializados

**Estado**: Propuesto — aplazar hasta mayor estabilidad del sistema
**Fecha**: 2026-07-02
**Deciders**: Tech Lead / equipo de plataforma

---

## Contexto

`WorkspaceProvider` es el nodo de mayor fan-in de toda la aplicación (151 consumidores directos). Tras las refactorizaciones de FASE 4 (iteraciones 1-3), su complejidad se redujo significativamente:

| Métrica | Pre-FASE4 | Post-FASE4 |
|---|---|---|
| Líneas de `WorkspaceProvider()` | 168 | ~42 |
| Cyclomatic | 14 | ~4 |
| Cognitive | 21 | ~6 |

Sin embargo, el archivo sigue siendo el **único punto de entrada** para cuatro conceptos distintos: identidad del tenant, permisos de perfil, estado de suscripción y validación de sesión.

---

## Decisión

**No implementar el split ahora.** El riesgo supera el beneficio en el estado actual del proyecto.

La lógica de datos está en cascada (`workspace` requiere `profile`, `plan` requiere `workspace`) — separar estos contextos introduce complejidad de coordinación sin reducir el acoplamiento real.

---

## Propuesta técnica para implementación futura

### Árbol de providers propuesto

```tsx
// Nuevo orden en App.tsx (o en un ContextStack.tsx)
<AuthProvider>
  <PermissionsProvider>      ← fetches profile, determina role/status
    <TenantProvider>         ← fetches workspace, necesita workspaceId de PermissionsProvider
      <SubscriptionProvider> ← fetches planName, necesita workspaceId de TenantProvider
        <UIProvider>
          <router/>
        </UIProvider>
      </SubscriptionProvider>
    </TenantProvider>
  </PermissionsProvider>
</AuthProvider>
```

### Shim de compatibilidad (cero cambios en 151 callers)

```typescript
// src/features/auth/WorkspaceProvider.tsx — mantenido como fachada

export function useWorkspace(): WorkspaceContextValue {
  const { profile, profileActive } = usePermissions();
  const { workspace }              = useTenant();
  const { company, planName }      = useSubscription();
  return { profile, workspace, company, planName, loading: false };
}

// Los 151 callers no cambian un solo import.
```

### Orden de extracción sugerido (cuando se retome)

1. `PermissionsProvider` — expone `profile`, `profileActive`, `role`
   - Extrae `profileQuery` de `useWorkspaceQueries`
   - Fan-in estimado de `usePermissions`: 30-40 callers (los que usan `profile.role`)

2. `TenantProvider` — expone `workspace`, `workspaceId`
   - Extrae `workspaceQuery` de `useWorkspaceQueries`
   - La mayoría de callers (95+ hooks) solo necesitan `workspace.id`

3. `SubscriptionProvider` — expone `company`, `planName`
   - Extrae `companyQuery` + `planQuery`
   - Callers que necesitan `planName` para feature gating

4. Actualizar `useWorkspace()` como shim de composición.

5. Migrar gradualmente callers de `useWorkspace` a hooks especializados (`useTenant`, `usePermissions`, etc.) cuando sea conveniente — **no forzar en un big-bang**.

---

## Precondiciones para retomar

- [ ] Cobertura de tests de integración para `WorkspaceProvider` y sus principales consumidores
- [ ] `useWorkspaceMaybe()` y `useInvalidateWorkspace()` bien documentados (actualmente 0 callers externos conocidos)
- [ ] El árbol de rendering de App.tsx está estabilizado (sin cambios frecuentes en layout de providers)
- [ ] Equipo de frontend alineado en la nueva API de hooks (`useTenant`, `usePermissions`, etc.)

---

## Consecuencias de no hacer este split (riesgos aceptados)

- `useWorkspace` seguirá siendo el hook más utilizado del sistema — cualquier cambio en el tipo `WorkspaceContextValue` requiere revisar 151 callers.
- `WorkspaceProvider` es un SPOF (Single Point of Failure) para toda la autenticación de tenant.
- El estado de "loading/error/notFound/forbidden" está centralizado, lo que hace difícil optimizar selectivamente (e.g., mostrar el workspace mientras el plan aún carga).

---

## Referencias

- FASE 4 iteraciones 1-3: `WorkspaceProvider.tsx` — refactoring completado (2026-07-01)
- Fan-in medido por codebase-memory MCP en auditoría inicial (2026-06-30): 151 callers
- `docs/adr/README.md` — índice de ADRs del proyecto
