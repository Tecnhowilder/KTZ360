# INCIDENT RESPONSE GUIDE — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Procedimientos de respuesta ante incidentes en producción
> Para recovery técnico detallado: `docs/22_DISASTER_RECOVERY_GUIDE.md`

---

## 1. CLASIFICACIÓN DE INCIDENTES

| Severidad | Descripción | Ejemplos | SLA Respuesta | SLA Resolución |
|---|---|---|---|---|
| **P0 — Crítico** | Servicio completamente caído o breach de seguridad | DB inaccesible, credenciales comprometidas, RLS bypass | 15 min | 4 horas |
| **P1 — Alto** | Feature crítica no funciona para todos | ai-proxy caído, pagos no funcionan, login no funciona | 1 hora | 24 horas |
| **P2 — Medio** | Feature degradada o afecta a un subconjunto | Integración Alegra rota, reports lentos | 4 horas | 72 horas |
| **P3 — Bajo** | Problema menor o cosmético | UI bug, texto incorrecto | Próximo sprint | — |

---

## 2. PROCESO DE RESPUESTA

### FASE 1: DETECCIÓN (0-15 min)

```
1. ¿Cómo se detectó?
   - Sentry alert
   - Usuario reportó
   - Monitoreo proactivo
   - Deploy que falló

2. Confirmar que es un incidente real (no falso positivo)

3. Evaluar severidad (P0/P1/P2/P3)

4. Notificar al equipo: "Incidente [P0/P1] detectado en [componente], investigando"
```

### FASE 2: CONTENCIÓN (15-60 min)

```
Para P0/P1:
1. ¿Hay una forma de mitigar el impacto AHORA sin resolver la causa?
   - ¿Se puede hacer rollback del último deploy?
   - ¿Se puede deshabilitar la feature afectada con un feature flag?
   - ¿Los usuarios pueden usar una alternativa manual temporalmente?

2. Aplicar mitigación inmediata si existe

3. Mantener al equipo informado cada 30 minutos
```

### FASE 3: DIAGNÓSTICO

```
Fuentes de información:
□ Supabase Dashboard — Edge Function logs, DB connections, storage
□ Sentry — errores agrupados por frecuencia
□ audit_log — últimas acciones antes del incidente
□ ai_usage — si involucra IA
□ Git log — ¿hubo un deploy reciente que pudo causar esto?
□ status.supabase.com — ¿es un incidente del proveedor?
```

### FASE 4: RESOLUCIÓN

```
1. Implementar el fix mínimo que resuelve el problema
2. Probar en staging (si hay tiempo)
3. Aplicar en producción
4. Verificar que el problema está resuelto
5. Monitorear 30 minutos adicionales
```

### FASE 5: POST-MORTEM (dentro de 48h para P0/P1)

Ver template en `docs/22_DISASTER_RECOVERY_GUIDE.md` sección 7.

---

## 3. RUNBOOKS POR TIPO DE INCIDENTE

### 3.1 "Los usuarios no pueden hacer login"

```
1. Verificar Supabase Auth status (status.supabase.com)
2. Probar login manualmente con cuenta de prueba
3. Revisar logs de auth en Supabase Dashboard
4. Si es problema de Supabase: comunicar a usuarios, esperar
5. Si es bug de código (después de deploy): rollback frontend
6. Si es problema de config (VITE_SUPABASE_URL, etc.): verificar y corregir
```

### 3.2 "Los pagos no se están confirmando"

```
1. Verificar logs de mp-webhook en Supabase Edge Functions
2. ¿Está llegando el webhook? (ver logs del endpoint)
3. ¿Está fallando la validación HMAC? (revisar MERCADOPAGO_WEBHOOK_SECRET)
4. ¿Falla la actualización de la factura? (revisar audit_log)
5. Verificar manualmente con MP Dashboard si los webhooks se enviaron
6. Si es configuración: actualizar el secret y re-enviar el webhook desde MP
```

### 3.3 "AI Studio no responde / muy lento"

```
1. Ejecutar ai-health-check: GET /functions/v1/ai-health-check
2. Si Gemini está caído: verificar si NVIDIA está activo como fallback
3. Si ambos caídos: deshabilitar temporalmente AI Studio (feature flag)
4. Si es latencia: revisar si el modelo seleccionado es el correcto
5. Revisar rate limits: ¿alguna empresa agotó sus créditos?
```

### 3.4 "Datos de una empresa aparecen en otra empresa"

```
⚠️ INCIDENTE CRÍTICO — P0
1. Identificar el scope del problema: ¿cuántas empresas afectadas?
2. Suspender el workspace afectado INMEDIATAMENTE
3. Identificar qué query/RPC o política RLS falló
4. Revisar las últimas migraciones: ¿se modificó alguna política RLS?
5. Notificar a las empresas afectadas
6. Implementar fix de RLS
7. Auditar qué datos fueron visibles y por cuánto tiempo
8. Post-mortem exhaustivo obligatorio
```

---

## 4. COMUNICACIÓN DURANTE INCIDENTES

### 4.1 Mensajes internos (WhatsApp/Slack del equipo)

```
[INICIO] 🔴 Incidente P[N] detectado: [descripción en 1 línea]. Investigando. /[nombre]
[UPDATE] ⚠️ P[N] Update: causa identificada como [X]. ETA resolución: [Y]. /[nombre]
[RESUELTO] ✅ P[N] Resuelto: [qué se hizo]. Monitoreando. /[nombre]
```

### 4.2 Comunicación a usuarios (si el impacto es visible)

```
Email/In-app: 
"Estamos trabajando en resolver un problema técnico que afecta [descripción breve]. 
Nuestro equipo está en ello y esperamos resolverlo en [ETA]. 
Disculpa las molestias."

Post-resolución:
"El problema ha sido resuelto. [Descripción de qué funcionó mal].
Tus datos están seguros y no se perdió ninguna información."
```

---

## 5. CONTACTOS DE EMERGENCIA

| Recurso | Contacto | Cómo |
|---|---|---|
| Supabase Support | support.supabase.com | Ticket de soporte |
| Equipo Shelwi | wildercaicedo88@gmail.com | Email / WhatsApp |
| MercadoPago Soporte | developers.mercadopago.com | Ticket técnico |
| Google/Gemini | cloud.google.com/support | Consola GCP |

---

*Ver: `docs/22_DISASTER_RECOVERY_GUIDE.md` para procedimientos técnicos de recovery*
*Ver: `docs/21_OBSERVABILITY_GUIDE.md` para herramientas de diagnóstico*
*Ver: `docs/46_SECURITY_CHECKLIST.md` para respuesta específica a vulnerabilidades de seguridad*
