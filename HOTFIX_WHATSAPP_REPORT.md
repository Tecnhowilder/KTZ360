# HOTFIX_WHATSAPP_REPORT.md — Números WhatsApp Incorrectos
Fecha: 2026-06-23

## CAUSA RAÍZ

La tabla `clients` (y `leads`, `profiles`) almacena el teléfono como texto plano sin código de país.
Ejemplo: `"3154823475"` en lugar de `"+573154823475"`.

Todos los helpers de WhatsApp hacen:
```typescript
const clean = phone.replace(/\D/g, '');
// clean = "3154823475"
const url = `https://wa.me/${clean}`;
// url = "https://wa.me/3154823475"
```

WhatsApp interpreta los primeros dígitos como código de país:
- `31` = Países Bajos → `+31 54823475` → "El número no está en WhatsApp"

## ARCHIVOS AFECTADOS

| Archivo | Función | Problema |
|---------|---------|---------|
| `src/lib/capacitorBridge.ts` línea 87 | `openWhatsApp()` | `phone.replace(/\D/g, '')` sin prefijo país |
| `src/services/whatsapp.ts` línea 93 | `openWhatsApp()` | `cleanPhone` sin prefijo país |
| `src/lib/shareUtils.ts` línea 45 | (deprecated) | Mismo problema |
| `src/lib/calc.ts` línea 139 | `openWhats()` | Solo abre WA sin número |
| `src/components/cotizaciones/CotizacionesMobile.tsx` línea 469 | IA recs | `clientPhone.replace(/\D/g,'')` sin código país |

## COLUMNAS EN DB

| Tabla | Columna actual | Columna a agregar |
|-------|---------------|------------------|
| `clients` | `phone text` | `country_code text DEFAULT '+57'` |
| `leads` (si existe) | `phone text` | `country_code text DEFAULT '+57'` |
| `profiles` | `phone text` | `country_code text DEFAULT '+57'` |

## SOLUCIÓN PROPUESTA

### 1. Migración DB
Añadir `country_code` a `clients`. Migrar existentes asumiendo +57.

### 2. URL Builder
```typescript
// Correcto:
const url = `https://wa.me/${countryCode.replace('+','')}${phone.replace(/\D/g,'')}`;
// Ejemplo: wa.me/573154823475
```

### 3. UI
Selector de país en formularios de cliente con `react-international-phone`.
Default: 🇨🇴 +57 Colombia.

### 4. Sin instalar librerías complejas
`libphonenumber-js` pesa 200KB. Para el caso de uso actual (selector de país + format básico) es suficiente un selector simple con los países más comunes.
