# DISASTER RECOVERY GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Procedimientos de recuperación ante fallos críticos
> RTO objetivo: 4 horas | RPO objetivo: 1 hora

---

## 1. DEFINICIONES

| Término | Definición | Target |
|---|---|---|
| RTO (Recovery Time Objective) | Tiempo máximo para restaurar el servicio | 4 horas |
| RPO (Recovery Point Objective) | Máxima pérdida de datos aceptable | 1 hora |
| MTD (Max Tolerable Downtime) | Tiempo máximo de interrupción total | 24 horas |

---

## 2. INVENTARIO DE COMPONENTES CRÍTICOS

| Componente | Criticidad | Proveedor | SLA Proveedor |
|---|---|---|---|
| Base de datos Supabase (Postgres) | P0 | Supabase | 99.9% |
| Auth (Supabase Auth) | P0 | Supabase | 99.9% |
| Edge Functions (14 funciones) | P0 | Supabase (Deno) | 99.9% |
| Storage (6 buckets) | P1 | Supabase | 99.9% |
| Frontend hosting | P1 | Vercel / proveedor actual | 99.9% |
| Gemini AI | P2 | Google | — |
| NVIDIA NIM | P2 | NVIDIA | — |
| MercadoPago | P2 | MP | — |
| Sentry (error tracking) | P3 | Sentry | — |

---

## 3. ESCENARIOS DE FALLO Y RESPUESTA

### 3.1 Escenario A: Base de datos inaccesible

**Síntoma:** Todas las queries fallan, app muestra error de conexión
**Causa probable:** Supabase incident, reaching connection limits, migration mal ejecutada

**Respuesta:**
1. Verificar `status.supabase.com` — ¿hay incidente activo?
2. Si hay incidente de Supabase: esperar, comunicar a usuarios
3. Si es migration defectuosa:
   ```bash
   # Verificar qué migración causó el problema
   supabase db remote commit  # ver estado
   # Hacer rollback manual de la última migración
   ```
4. Si es connection limit:
   ```sql
   -- Ver conexiones activas
   SELECT count(*) FROM pg_stat_activity;
   -- Matar conexiones idle
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '5 min';
   ```
5. Activar modo offline en app (Dexie — ya implementado)
6. Registrar incidente, post-mortem en 48h

---

### 3.2 Escenario B: Edge Function crítica caída (ai-proxy)

**Síntoma:** AI Studio no funciona, agentes no responden
**Causa probable:** Bug en deployment, secret no configurado, dependency externa caída

**Respuesta:**
1. Ver logs de la función: Supabase Dashboard > Edge Functions > ai-proxy > Logs
2. Identificar el error específico:
   - `GEMINI_API_KEY not configured` → `supabase secrets set GEMINI_API_KEY=...`
   - `NVIDIA_API_KEY not configured` → `supabase secrets set NVIDIA_API_KEY=...`
   - Bug de código → rollback al commit anterior + re-deploy
3. Si Gemini está caído: el sistema debería usar NVIDIA como fallback (ver `09_MODEL_REGISTRY.md`)
4. Si NVIDIA también caído: deshabilitar temporalmente AI Studio features
5. Estimado de fix: 30-60 min si es configuración, 2-4h si es bug de código

---

### 3.3 Escenario C: Secreto comprometido

**Síntoma:** Acceso no autorizado detectado, credenciales encontradas en logs/git
**Criticidad:** P0 — acción INMEDIATA

**Respuesta:**
1. **Rotar el secreto AHORA:**
   ```bash
   supabase secrets set NOMBRE_SECRETO=<nuevo-valor>
   ```
2. Si es `SUPABASE_SERVICE_ROLE_KEY`: contactar soporte de Supabase para reset
3. Si es `INTEGRATION_ENCRYPTION_KEY`: rotar Y re-cifrar todas las `integration_credentials`
4. Si es API Key de tercero (Gemini, MP): revocar en panel del proveedor + generar nueva
5. Auditar `audit_log` de las últimas 24-48h para detectar accesos sospechosos
6. Notificar a usuarios afectados si hubo acceso a datos
7. Post-mortem obligatorio en 24h

---

### 3.4 Escenario D: Frontend inaccesible

**Síntoma:** La web app no carga
**Causa:** Fallo del hosting, domain issue, build roto

**Respuesta:**
1. Verificar status del hosting provider
2. Si es build roto: rollback al deploy anterior (1 click en Vercel)
3. Los usuarios móviles (Capacitor) siguen funcionando si tienen la app instalada
4. El modo offline (Dexie) permite operación sin conectividad al backend

---

### 3.5 Escenario E: Pérdida de datos en tabla crítica

**Síntoma:** Registros borrados accidentalmente (por bug, por usuario, por migration)
**Causa:** DELETE sin WHERE, DROP TABLE accidental, migration destructiva

**Respuesta:**
1. **STOP** — no más operaciones en la tabla afectada
2. Supabase hace backups automáticos cada hora → contactar soporte para restore
   - Plan Pro de Supabase: Point-in-Time Recovery (PITR) disponible
   - Free plan: backups diarios (RPO = 24h)
3. Si hay `deleted_at` (soft delete): los datos NO se perdieron
   ```sql
   SELECT * FROM clients WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC;
   ```
4. Si no hay soft delete: contactar soporte Supabase con ventana de tiempo exacta

---

## 4. BACKUP MANUAL — PROCEDIMIENTO

```bash
# Exportar toda la base de datos
supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql

# Exportar solo datos (sin schema)
supabase db dump --data-only -f data_$(date +%Y%m%d_%H%M%S).sql

# Exportar tabla específica
pg_dump $DATABASE_URL -t public.clients > clients_backup.sql
```

**Frecuencia mínima de backups manuales:** Antes de cada migration mayor

---

## 5. RECOVERY DE EDGE FUNCTIONS

```bash
# Ver deploys anteriores en Supabase
# (Supabase no tiene rollback automático de Edge Functions)

# Re-deploy de versión específica vía git
git checkout <commit-anterior>
supabase functions deploy ai-proxy
git checkout main
```

---

## 6. COMUNICACIÓN DURANTE INCIDENTES

| Fase | Audiencia | Canal | Mensaje |
|---|---|---|---|
| Detección (0-15min) | Equipo técnico | WhatsApp/Slack | "Incidente detectado en [componente], investigando" |
| Diagnóstico (15-60min) | Equipo técnico | WhatsApp/Slack | "Causa identificada: [X], ETA fix: [Y]" |
| Resolución | Usuarios afectados | Email / in-app | "El servicio ha sido restaurado. Disculpa las molestias." |
| Post-mortem (48h) | Equipo | Documento | Análisis completo, causa raíz, acciones preventivas |

---

## 7. POST-MORTEM TEMPLATE

```markdown
# Post-Mortem: [Nombre del Incidente]
Fecha: [fecha]
Duración: [X horas]
Impacto: [descripción del impacto]
Severidad: P0/P1/P2

## Timeline
- HH:MM — Primeros síntomas detectados
- HH:MM — Incidente confirmado
- HH:MM — Causa raíz identificada
- HH:MM — Fix aplicado
- HH:MM — Servicio restaurado

## Causa Raíz
[Descripción técnica de qué falló y por qué]

## ¿Qué funcionó bien?
[Detección rápida, etc.]

## ¿Qué podría mejorar?
[Lista de mejoras]

## Acciones Preventivas
| Acción | Responsable | Fecha límite |
|---|---|---|
| | | |
```

---

*Ver: `docs/25_PLATFORM_STABILITY_GUIDE.md` para prácticas de estabilidad preventiva*
*Ver: `docs/21_OBSERVABILITY_GUIDE.md` para detección temprana de problemas*
*Ver: `docs/20_DEVSECOPS_GUIDE.md` para prevención de incidentes de seguridad*
