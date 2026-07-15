# BUSINESS BLUEPRINT — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Define QUÉ es Shelwi, PARA QUIÉN es, POR QUÉ existe y CÓMO se diferencia

---

## 1. MISIÓN

> Ser el sistema operativo empresarial que permite a las PYMEs latinoamericanas competir con la eficiencia de las grandes corporaciones, sin su complejidad ni su costo.

---

## 2. QUÉ ES Y QUÉ NO ES

### Shelwi ES:
- Un **Business Operating System** — la capa inteligente que conecta todas las operaciones de una empresa
- Una plataforma que convierte procesos fragmentados en flujos automatizados e inteligentes
- Un sistema que aprende de cada empresa y se vuelve más valioso con el tiempo
- Una solución nativa móvil + web con capacidades offline para empresas en campo

### Shelwi NO ES:
- ❌ Un CRM (aunque tiene módulo CRM completo)
- ❌ Un ERP (aunque tiene contabilidad básica)
- ❌ Un gestor de tareas (aunque tiene gestión de proyectos)
- ❌ Un chatbot de IA (aunque tiene agentes IA)
- ❌ Una herramienta puntual — es la plataforma central de operaciones

---

## 3. SEGMENTO OBJETIVO

### Cliente Ideal (ICP — Ideal Customer Profile)

| Dimensión | Descripción |
|---|---|
| **Tamaño** | 5 a 200 empleados |
| **Geografía** | Latinoamérica (Colombia, México, Perú, Chile, Argentina) |
| **Industria** | Servicios, Construcción, Manufactura ligera, Comercio, Salud, Transporte |
| **Madurez Digital** | Usando WhatsApp + Excel + 2-3 apps sueltas (no sistema integrado) |
| **Dolor Principal** | Información dispersa, procesos manuales, no puede escalar sin caos |
| **Tomador de Decisión** | Dueño/Gerente General o Director de Operaciones |
| **Budget** | USD $30-300/mes por workspace |

### Verticales Prioritarias

1. **Servicios de Campo** — empresas con personal en movimiento (instaladores, técnicos, agentes de venta)
2. **Manufactura / Taller** — control de producción, inventario, pedidos
3. **Comercio B2B** — cotizaciones, pedidos, facturación, cobranza
4. **Servicios Profesionales** — consultoría, contabilidad, arquitectura (gestión de proyectos y clientes)

---

## 4. PROPUESTA DE VALOR POR PLAN

| Plan | Precio (ref.) | Propuesta de Valor | Para quién |
|---|---|---|---|
| **Free** | $0 | CRM básico + Tareas + hasta X usuarios | Startup o empresa evaluando |
| **Start** (ex-Pro) | ~$30/mes | + Cotizaciones + Pedidos + Portal cliente | Empresa chica operacional |
| **Growth** (ex-Premium) | ~$80/mes | + Finanzas + Reportes + Integraciones | Empresa en crecimiento |
| **Business OS** | ~$150/mes | + Agentes IA + Automatizaciones avanzadas | Empresa lista para IA |
| **Enterprise OS** | Custom | + SSO + White Label + API pública + Soporte dedicado | Multi-empresa / Enterprise |

---

## 5. DIFFERENTIATORS VS. COMPETENCIA

| Aspecto | Shelwi | Salesforce/HubSpot | Odoo/SAP | Asana/Monday |
|---|---|---|---|---|
| **Precio** | Accesible LATAM | Alto | Muy alto | Medio |
| **Complejidad** | Baja (OS intuitivo) | Alta | Muy alta | Media |
| **IA integrada** | Nativa + agentes | Bolt-on costoso | Limitado | Básico |
| **Offline** | ✅ Nativo | ❌ | ❌ | ❌ |
| **Móvil nativo** | ✅ iOS + Android | ❌ App parcial | ❌ | Limitado |
| **Localización LATAM** | ✅ IVA, facturación local | Parcial | Parcial | ❌ |
| **Pagos locales** | MercadoPago | ❌ | Stripe | ❌ |
| **Integración Alegra** | ✅ | ❌ | ❌ | ❌ |
| **Customizable sin código** | ✅ Automatizaciones | Parcial | Requiere consultor | Parcial |
| **Multi-módulo integrado** | ✅ Un OS | Necesita addons | Modular pero caro | Solo proyectos |

---

## 6. JOURNEY DEL USUARIO

### Onboarding (Día 0-7)

```
Registro → Crear workspace → Tour guiado → 
Agregar primeros clientes (importación CSV disponible) →
Crear primera cotización → Primer pago recibido
(Time to First Value objetivo: < 30 minutos)
```

### Adopción (Semana 2-4)

```
Invitar equipo → Asignar roles → 
Activar módulos adicionales (ej: GPS, Evidencias) →
Primera automatización configurada →
Portal cliente activado
```

### Expansión (Mes 2-6)

```
Activar integraciones (Alegra, WhatsApp) →
Dashboard ejecutivo configurado →
Primer agente IA activado (modo observer) →
Automatizaciones multi-paso funcionando
```

### Retención (Mes 6+)

```
Agentes IA en modo assistant →
Knowledge Graph con memoria empresarial →
Reportes ejecutivos automatizados →
Dependencia operativa alta (datos, historial, flujos)
```

---

## 7. MÉTRICAS DE ÉXITO DEL PRODUCTO

### Adopción

| Métrica | Objetivo |
|---|---|
| Time to First Value | < 30 minutos |
| Activación (usa módulo core en 7 días) | > 70% |
| Retención a 30 días | > 80% |
| Retención a 90 días | > 65% |
| NPS (Net Promoter Score) | ≥ 40 |

### Negocio

| Métrica | Objetivo Año 1 |
|---|---|
| Empresas activas pagando | 100+ |
| MRR | $5k-$10k USD |
| Churn mensual | < 5% |
| Expansión (upsell) revenue | > 20% del MRR |

### Producto

| Métrica | Objetivo |
|---|---|
| Uptime | 99.9% |
| LCP (Core Web Vitals) | < 2.5s |
| Actions per user per day (engagement) | > 10 |
| AI actions completed successfully | > 95% |

---

## 8. MODELO DE MONETIZACIÓN

### Revenue Streams

1. **Suscripciones recurrentes** — Plan mensual/anual (MRR principal)
2. **Licencias adicionales** — Usuarios extra sobre el límite del plan
3. **AI Credits** — Créditos IA adicionales al límite del plan
4. **Storage** — GB adicionales de almacenamiento
5. **Enterprise contracts** — Acuerdos custom para grandes cuentas

### Pagos

- MercadoPago (primario LATAM — Colombia, México, Argentina, Chile, Perú)
- Stripe (empresas con tarjeta internacional)
- Ambos ya implementados en `create-checkout` Edge Function

---

## 9. PILARES ESTRATÉGICOS

### Pilar 1: Intelligence First
Shelwi no solo gestiona — piensa. Cada módulo tiene un agente IA que aprende, anticipa y actúa dentro de los límites definidos por la empresa.

### Pilar 2: Offline First
La realidad de LATAM: conectividad intermitente. Shelwi funciona offline y sincroniza cuando hay red. Nunca pierde datos.

### Pilar 3: Mobile First
El dueño de PYME usa su teléfono más que una laptop. Toda la plataforma funciona perfectamente en móvil (iOS + Android via Capacitor).

### Pilar 4: Zero Complexity
La potencia de un ERP con la simplicidad de una app de mensajería. Ningún módulo requiere capacitación técnica.

### Pilar 5: LATAM Native
Facturación local, impuestos locales (IVA, retenciones), pagos locales, integraciones contables locales (Alegra), idioma y cultura local.

---

## 10. RESTRICCIONES DE NEGOCIO

| Restricción | Implicación técnica |
|---|---|
| LATAM compliance fiscal | Facturación con campos de IVA, CUIT/RUT, retenciones |
| Datos deben permanecer en LATAM | Supabase region selection en Enterprise plan |
| Precios en moneda local | Multi-currency en Invoice y Quote |
| WhatsApp es canal principal | Integración WhatsApp Business obligatoria |
| Baja literacy técnica de usuarios | UI ultra simple, no requiere entrenar |
| Empresas sin IT team | Supabase como BaaS elimina necesidad de infraestructura propia |

---

*Actualizar cuando cambie el posicionamiento, precios o ICP.*
*Referencias: `docs/architecture/AI_MONETIZATION_MODEL.md`, `docs/roadmap/PLAN_MATRIX_IMPACT_ANALYSIS.md`*
