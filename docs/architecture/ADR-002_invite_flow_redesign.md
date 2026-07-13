# ADR-002: Invitation Flow Redesign & Role-Based Navigation

**Date:** 2026-07-01  
**Status:** Accepted  
**Authors:** Engineering team (Sprint 25)

---

## Context

The legacy `AcceptInvite.tsx` was a single-component page that mixed auth, onboarding, and navigation concerns. It had several problems:

1. Reused `RegisterPage` logic — no dedicated UX for invited users.
2. Navigation was hardcoded to `/app/dashboard` in 3+ places, breaking role-based routing for `comercial`, `operario`, and admin users.
3. The `record_attendance` RPC did not compute `hours_worked`, `lunch_minutes`, or update `status` on check-out, causing silent data loss.
4. Operarios could not check out without first recording lunch (linear flow bug).

---

## Decision

### 1. InviteWizard (multi-step state machine)

Replace `AcceptInvite.tsx` with a dedicated `InviteWizard` orchestrated as an explicit state machine:

```
loading → invite_card → create_password → [await_confirm]
                     ↘ (session exists) accepting → profile_completion → welcome → home
```

**Why a state machine:** The invitation flow has multiple terminal states (expired, revoked, email mismatch, already accepted via trigger) and async branching. Explicit state names make each branch auditable and testable without hidden `if/else` nesting.

**Trigger detection:** The `handle_new_user()` DB trigger auto-accepts invitations on signup. The wizard detects this by checking `preview.status === 'accepted'` with a matching session email, then routes directly to `profile_completion` if `onboarding_seen = false`, or to home if already done. This avoids a redundant `accept_invitation` RPC call.

### 2. NavigationService — `getHomeForRole()`

Single source of truth for role → home path mapping in `src/lib/navigation.ts`:

| Role | Home |
|------|------|
| owner, admin, supervisor | `/app/dashboard` |
| comercial | `/app/clientes` |
| operario | `/app/pedidos` |
| super_admin, support_admin | `/app/admin` |

Applied in: `AppIndexRedirect`, `OnboardingPage`, `InviteWizard`. `LoginPage` navigates to `/app` (index redirect) to avoid an extra DB query post-login.

**To add a new role:** add one entry to the `ROLE_HOME` record in `navigation.ts`. No other files need changing.

### 3. Attendance fix — optional lunch, computed hours

`record_attendance` RPC was rewritten (migration 0126) to:
- Set `status = 'present'` on `check_in` and `check_out`.
- Compute `hours_worked` and `lunch_minutes` on `check_out`.
- Auto-close an open lunch on `check_out` (lunch is now optional).

Frontend (`OperarioDashboard`) uses `primaryEvent` / `secondaryEvent` pattern:
- Primary: always the next mandatory action (check_in → check_out).
- Secondary (ghost button): optional lunch start, only shown between check_in and check_out.

### 4. Profile module (`/app/perfil`)

New `ProfilePage` at `/app/perfil` with personal info and password change sections. It reads from `useWorkspace()` (already loaded) and writes directly to `profiles` via Supabase client. Photo upload is deferred (placeholder shown).

---

## Trade-offs

| Choice | Alternative considered | Reason rejected |
|--------|------------------------|-----------------|
| State machine in single component | Split wizard into separate routes | Routes would require URL sharing of invite state; token visible in back-navigation |
| `getHomeForRole()` in navigation.ts | Role checks in each component | Fragmentation — 3 files had different hardcoded paths |
| `ProfileRow` type extended manually | Re-generate Supabase types | Type gen requires network access and is slow in CI; manual extension is minimal and traceable |
| Remove audit log fire-and-forget in wizard | Keep it with `as any` | Type safety > marginal audit coverage; `accept_invitation` already audits the event |

---

## Constraints

- **NOT modified:** Quote flow, order flow, calculation engine, WorkspaceProvider, existing RPCs (except `record_attendance` which was explicitly buggy).
- **Backward compatible:** `accept_invitation` 1-param RPC signature unchanged. `getHomeForRole` falls back to `/app/dashboard` for unknown roles.
- **Zero Trust maintained:** `workspace_id` always derived from `auth.uid()` in DB, never from client payload.

---

## How to Extend

- **New role with custom home:** add to `ROLE_HOME` in `src/lib/navigation.ts`.
- **New wizard step:** add a new `WizardStep` union member and a matching `if (state.step === '...')` render block. State transitions go in the orchestrator (`InviteWizard.tsx`), not in step components.
- **Profile fields:** add the column to the DB via migration, add to `ProfileRow` in `database.types.ts`, then add the field to `PersonalInfoSection` in `ProfilePage.tsx`.
