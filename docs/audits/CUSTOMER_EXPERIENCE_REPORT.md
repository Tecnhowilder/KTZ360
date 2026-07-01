# CUSTOMER_EXPERIENCE_REPORT.md
# Shelwi — Customer Experience CMS
Fecha: 2026-06-23

---

## RESUMEN

| Componente | Estado |
|------------|--------|
| Auditoría de Sprint 15–16 | ✅ Completada (ver AUDIT_CUSTOMER_EXPERIENCE.md) |
| Migración 0092 (9 RPCs nuevas) | ✅ Lista para aplicar |
| CustomerExperienceTab.tsx | ✅ Creado |
| AdminPanel.tsx (tab 'cx') | ✅ Actualizado |
| Build 0 errores TypeScript | ✅ PASS |
| Sin duplicados Sprint 15/16 | ✅ PASS |

---

## ENTREGABLES

### Migración 0092 — 9 RPCs de administración

| RPC | Descripción |
|-----|-------------|
| `upsert_loyalty_program()` | Configura puntos por COP, por OT, por reseña, niveles |
| `upsert_loyalty_reward()` | Crea/edita recompensa del catálogo |
| `delete_loyalty_reward()` | Elimina recompensa |
| `adjust_loyalty_points()` | Ajuste manual de puntos (bonus/corrección) |
| `get_loyalty_dashboard()` | Dashboard de loyalty: programa + recompensas + top clientes + últimas transacciones |
| `toggle_review_visibility()` | Moderar reseña (ocultar/mostrar) |
| `upsert_survey()` | Crear/actualizar encuesta con NPS, trigger, delay |
| `delete_survey()` | Elimina (o desactiva si tiene respuestas) |
| `get_cx_dashboard()` | Dashboard consolidado: NPS + Reviews + Loyalty + Surveys |

### Archivo nuevo
- [src/components/admin/CustomerExperienceTab.tsx](src/components/admin/CustomerExperienceTab.tsx)

### Archivo modificado
- [src/views/AdminPanel.tsx](src/views/AdminPanel.tsx) — Tab 'cx' → Customer Experience

---

## LO QUE SE REUTILIZA (no duplicado)

| Sprint | RPC reutilizada | Desde |
|--------|----------------|-------|
| 16 | `get_reviews()` | `ReviewsSection` del tab |
| 16 | `get_nps_summary()` | `ReviewsSection` para KPIs |
| 16 | `respond_to_review()` | Botón de respuesta en reviews |
| 16 | `get_survey_responses()` | Disponible pero no duplicada en CMS |
| 16 | `assign_loyalty_points()` | Para triggers — no duplicada en CMS |
| 15 | `CustomerSuccessPage` | NO modificada — health scores separados |

---

## SECCIÓN ADMIN — 3 SUB-TABS

### 🏆 Loyalty
- KPIs: puntos emitidos, canjeados, participantes, transacciones 30d
- Configurar programa: puntos por COP, OT, reseña
- Crear/eliminar recompensas del catálogo
- Top 5 clientes por puntos acumulados

### ⭐ Reseñas
- NPS score, promotores, detractores, rating promedio
- Lista de reseñas con moderación (ocultar/mostrar)
- Responder reseñas directamente desde el CMS

### 📋 Encuestas
- Crear encuestas: trigger (order/OT/manual), delay, NPS incluido
- Activar/desactivar por encuesta
- NPS promedio por encuesta

---

## ACCESO

`/app/admin?tab=cx` — Tab "Customer Experience"

Requiere: `super_admin` o `support_admin` (heredado del AdminPanel wrapper `RequireSuperAdmin`)
