# RELEASE STRATEGY — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Proceso y cadencia de releases a producción

---

## 1. CADENCIA DE RELEASES

| Tipo | Cadencia | Duración sprint |
|---|---|---|
| Feature Release (minor) | Al completar cada FASE del roadmap | 3-6 semanas |
| Bug Fix Release (patch) | Según acumulación de fixes | 1-2 semanas |
| Hotfix | Cuando hay bug crítico en producción | Inmediato |
| Architecture Release | Al completar refactors mayores | — |

---

## 2. RELEASE PLAN (basado en EPMO v2)

| Versión | Nombre | Contenido Principal | Estado |
|---|---|---|---|
| v1.4.x | Current | Baseline actual — FASES 0-1 | ✅ Producción |
| v1.5.0 | "Visibility" | Dashboard ejecutivo enterprise, AI Studio v2 | 🎯 Próximo |
| v1.6.0 | "Intelligence" | Memory Engine, Policy Engine UI, Agent Marketplace | Planificado |
| v1.7.0 | "Automation" | Automation Builder visual, Portal cliente v2 | Planificado |
| v2.0.0 | "Platform" | Multi-tenant avanzado, Marketplace externo | Futuro |

---

## 3. PROCESO DE RELEASE

### Paso 1: Feature Freeze (D-7)
```
- Crear rama release/x.x.x desde develop
- No más features en esta rama — solo bug fixes
- Comunicar al equipo: "Feature freeze para v1.5.0"
- Actualizar SHELWI_OS_EPMO_v2.md con el release plan actualizado
```

### Paso 2: Release Candidate (D-5 a D-2)
```
- Deploy de release/x.x.x a staging
- Smoke tests completos (ver checklist abajo)
- Fix de bugs encontrados en staging
- Actualizar CHANGELOG si existe
```

### Paso 3: Pre-release Checklist (D-1)
```
- [ ] Todas las migrations incluidas en la release están aplicadas en staging
- [ ] Secrets de producción actualizados si hay nuevos
- [ ] Performance: LCP < 2.5s en staging
- [ ] Zero errores en Edge Functions en staging (últimas 24h)
- [ ] Feature flags configurados correctamente por plan
- [ ] Rollback plan documentado
- [ ] Ventana de deploy definida (horario de bajo uso)
- [ ] Equipo notificado
```

### Paso 4: Deploy a Producción (D-0)
```bash
# 1. Aplicar migrations a producción
supabase db push --db-url $PRODUCTION_DB_URL

# 2. Deploy de Edge Functions
supabase functions deploy --project-ref $PROD_PROJECT_REF

# 3. Deploy del frontend (via CI o manual)
# [según setup de hosting]

# 4. Smoke test en producción
# - Login y logout
# - Crear cliente de prueba
# - Edge Function de IA responde
# - Edge Functions de pago responden

# 5. Taggear la versión
git checkout main
git merge release/1.5.0
git tag -a v1.5.0 -m "Release v1.5.0: Dashboard ejecutivo + AI Studio v2"
git push origin main --tags
```

### Paso 5: Post-release (D+1 a D+3)
```
- Monitorear métricas de error en Sentry (primeras 48h)
- Verificar ai_usage está dentro del presupuesto
- Verificar que las nuevas features funcionan para clientes reales
- Cerrar issues relacionados en el tracker
- Limpiar rama release/x.x.x
```

---

## 4. HOTFIX PROCESS

Para bugs críticos que no pueden esperar el próximo release:

```bash
# 1. Crear rama desde main (producción)
git checkout main
git checkout -b hotfix/mp-webhook-signature-fix

# 2. Fix del bug
# ...

# 3. PR a main Y a develop
# PR 1: hotfix → main (con reviewer)
# PR 2: hotfix → develop (para sincronizar)

# 4. Deploy inmediato (solo el artefacto afectado)
supabase functions deploy mp-webhook  # si es Edge Function

# 5. Tag de patch
git tag -a v1.4.1 -m "Hotfix: MP webhook signature validation"
```

---

## 5. COMUNICACIÓN DE RELEASES

### A usuarios (en-app y email)
- Features nuevas: notificación in-app al primer login post-release
- Cambios de plan: email previo al cambio
- Mantenimiento programado: banner 24h antes

### Al equipo
- Feature freeze: Slack/WhatsApp D-7
- Release completado: confirmación + métricas D+1

---

*Ver: `docs/26_BRANCH_STRATEGY.md` para estrategia de ramas*
*Ver: `docs/28_CICD_PIPELINE.md` para automatización del proceso*
*Ver: `docs/SHELWI_OS_EPMO_v2.md` sección "Release Plan" para versiones futuras*
