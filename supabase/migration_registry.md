# Migration Registry — Shelwi / Brivia App

Registro oficial de migraciones SQL del proyecto.

**Regla fundamental**: cada sprint reserva su número ANTES de escribir código.
Un número reservado no puede ser tomado por otro sprint sin aprobación del Tech Lead.

---

## Estado actual del historial

| Rango | Estado | Notas |
|---|---|---|
| 0001 – 0123 | ✅ Aplicado en producción | **Inmutables. No modificar, no renumerar.** |
| 0028 | 🚫 Hueco histórico — NUNCA reutilizar | Número saltado durante el desarrollo. Queda como parte de la historia del proyecto. |
| 0121 | 🚫 Hueco histórico — NUNCA reutilizar | Ídem. |
| 0124 | 🟢 Próximo número disponible | |

---

## Registro de reservas

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- INSTRUCCIONES:                                                      -->
<!-- 1. Antes de crear una migración, añade una fila con Estado=Reservado -->
<!-- 2. Al aplicar en dev, cambia Estado a Aplicado (dev)               -->
<!-- 3. Al hacer deploy a prod, cambia Estado a Aplicado (prod)          -->
<!-- Formato: NNNN | Sprint | Owner | Descripción | Estado              -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

| Número | Sprint | Owner / Área | Descripción del objetivo | Estado |
|---|---|---|---|---|
| 0124 | 25 | — | _Por reservar_ | 🟢 Disponible |
| 0125 | 25 | — | _Por reservar_ | 🟢 Disponible |
| 0126 | 25 | — | _Por reservar_ | 🟢 Disponible |
| 0127 | 26 | — | _Por reservar_ | 🟢 Disponible |
| 0128 | 26 | — | _Por reservar_ | 🟢 Disponible |
| 0129 | 26 | — | _Por reservar_ | 🟢 Disponible |
| 0130 | 27 | — | _Por reservar_ | 🟢 Disponible |

---

## Historial aplicado en producción (resumen por sprint)

| Rango | Sprint / Feature | Destacado |
|---|---|---|
| 0001 – 0010 | Sprint 1–2: Schema base | workspaces, profiles, plans, quotes, catalog v2 |
| 0011 – 0015 | Sprint 2–3: Catalog + PDF | quote fields, rebrand KTZ360 |
| 0016 – 0020 | Sprint 3: Subscriptions + Roles | plan limits, feature enforcement, team roles |
| 0021 (×2) | Sprint 3: QA Seeds | ⚠️ Seed de test + cleanup — prefijo duplicado (histórico) |
| 0022 – 0027 | Sprint 3–4: Fixes + MercadoPago | subscription fixes, MP checkout |
| 0028 | — | 🚫 **Hueco histórico** — no reutilizar |
| 0029 – 0033 | Sprint 4: Quote Items + PDF | modelos relacionales, templates |
| 0034 (×2) | Sprint 4–5: Quote tracking | quote_revisions + quote_views — prefijo duplicado (histórico) |
| 0035 – 0044 | Sprint 5–6: Plans v2 + AI Credits + Onboarding | founder program, AI credits, onboarding |
| 0045 – 0049 | Sprint 4: CRM | crm_tables, crm_rpc, crm_triggers, reports |
| 0050 – 0055 | Sprint 6: Orders + Evidences | orders schema/rpc/triggers, evidences |
| 0053 (×2) | Sprint 7/9: Admin + Evidences | admin_sprint9 + evidences_schema — prefijo duplicado (histórico) |
| 0056 – 0061 | Sprint 8: GPS + Portal Cliente | gps, portal tokens, triggers |
| 0062 – 0072 | Sprint 11–12: Integraciones | Alegra, Drive, OneDrive, Teams, automations, storage addons |
| 0073 – 0077 | Sprint 15–16: Customer Success + Loyalty | reviews, surveys, loyalty, rebrand Shelwi |
| 0078 (×2) | Sprint 16–17: Growth + Performance | growth_schema + performance_sprint163 — prefijo duplicado (histórico) |
| 0079 – 0091 | Sprint 17–21: Growth + Finance + BI + Hardening | portal referral, finance, BI analytics, hardening |
| 0092 (×2) | Sprint 23: CX + RLS | cx_cms_rpcs + rls_hardening_with_check — prefijo duplicado (histórico) |
| 0093 – 0101 | Sprint 23–24: Webhooks + AI Ops + Sessions | webhooks, ai_operations_costs, workspace AI addons, active_sessions |
| 0097 (×2) | Sprint 24: Enterprise + Schema | enterprise_plan + sprint24_schema — prefijo duplicado (histórico) |
| 0098 (×2) | Sprint 24: Plans v3 + RPCs | plans_v3_matrix + sprint24_rpcs — prefijo duplicado (histórico) |
| 0099 – 0106 | Sprint 24: IA + Pedidos + Seguridad | ai_usage audit, custom permissions, ia_create_flow, state machine |
| 0102 (×2) | Sprint 24: Permisos + Hardening | custom_permissions + hardening_production — prefijo duplicado (histórico) |
| 0103 (×2) | Sprint 24: Portal Fix + Seed v2 | fix_public_portal + seed_test_users_v2 — prefijo duplicado (histórico) |
| 0104 (×2) | Sprint 24: Orders + WhatsApp | list_orders_search + phone_country_code — prefijo duplicado (histórico) |
| 0105 (×2) | Sprint 24: IA Flow + State Machine | ia_create_flow + state_machine_hardening — prefijo duplicado (histórico) |
| 0107 (×2) | Sprint 24: Invite fix + Stub | invite_return_token + STUB (contenido movido a 0111) — prefijo duplicado (histórico) |
| 0107 | Sprint 24 | 📄 Stub vacío — documenta la resolución de colisión con 0111 |
| 0108 – 0120 | Sprint 24–25: Team + Pedidos + Invitations | team production, pedidos, invitation hardening, RLS profiles |
| 0121 | — | 🚫 **Hueco histórico** — no reutilizar |
| 0122 – 0123 | Sprint 25: Secondary users + Invitations CMS | premium users, invitation admin + expiry |

---

## Cómo reservar un número

```markdown
1. Verifica que el número es el próximo libre (ver tabla "Registro de reservas").
2. Edita este archivo, cambia el estado de la fila a "Reservado por [tu-nombre]".
3. Abre un PR con solo este cambio antes de escribir la migración.
4. Al crear el archivo de migración, el nombre debe coincidir con la descripción aquí registrada.
5. Nunca uses un número reservado por otro sprint sin aprobación.
```

---

## Validación automática

Ejecutar antes de cada PR o como pre-commit hook:

```bash
chmod +x scripts/check-migrations.sh
./scripts/check-migrations.sh
```

En modo strict (bloquea también warnings):
```bash
./scripts/check-migrations.sh --strict
```
