# UX CONSTITUTION — SHELWI OS
> Versión: 1.0 | Fecha: 2026-07-14
> Principios, patrones y estándares de experiencia de usuario
> Stack: React 19 + shadcn/ui + Tailwind v3 + Capacitor 8 (Mobile First)

---

## 1. PRINCIPIOS DE DISEÑO

### 1. Mobile First — no Mobile Only
Shelwi es una app de operaciones de campo. El 70%+ del uso esperado es en móvil. Cada pantalla se diseña primero para 375px y luego se adapta a desktop.

### 2. Claridad antes que densidad
Una PYME latinoamericana usa el sistema para trabajar, no para explorarlo. Cada pantalla debe responder una pregunta: ¿qué necesita hacer el usuario AHORA?

### 3. Feedback inmediato
Toda acción del usuario debe tener respuesta visual en < 200ms. Las operaciones largas muestran loading states, progress bars o skeleton screens.

### 4. Operación offline-first
El sistema debe funcionar con conectividad intermitente. Las acciones críticas de campo (GPS, evidencias, tareas) deben funcionar offline y sincronizar al recuperar red.

### 5. Nunca bloquear por falta de permisos sin explicación
Si el usuario no tiene acceso a una función (por plan o por rol), debe saber por qué y qué puede hacer al respecto (upgrade, contactar admin).

---

## 2. SISTEMA DE DISEÑO

### 2.1 Librería de componentes: shadcn/ui

Todos los componentes UI usan la librería shadcn/ui (Radix UI + Tailwind). No crear componentes UI primitivos desde cero.

```typescript
// ✅ Importar desde shadcn
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';

// ❌ No crear botones/inputs/modales desde cero
```

### 2.2 Tailwind — clases utilitarias

Usar Tailwind v3 para estilos. No CSS inline, no módulos CSS custom.

```typescript
// ✅
<div className="flex items-center gap-4 p-6 rounded-xl bg-white shadow-sm">

// ❌
<div style={{ display: 'flex', padding: '24px' }}>
```

### 2.3 Tokens de color semánticos

```
// Paleta primaria (Shelwi brand)
primary:     brand blue
secondary:   brand purple
accent:      brand gold/yellow

// Estados
success:     green (facturas pagadas, tareas completadas)
warning:     amber (cotizaciones por vencer, alertas)
destructive: red (facturas vencidas, errores)
muted:       gray (texto secundario, estados neutrales)
```

---

## 3. PATRONES DE NAVEGACIÓN

### 3.1 Estructura de la app

```
/ (root)
  /auth         — Login, register, forgot password
  /onboarding   — Setup inicial de workspace
  /app          — App principal (requiere auth)
    /dashboard  — Panel principal con KPIs
    /crm        — Clientes, cotizaciones, pedidos
    /finance    — Facturas, pagos, reportes
    /operations — Tareas, proyectos, campo (GPS)
    /hr         — Empleados, evaluaciones
    /ai-studio  — Agentes y automatizaciones IA
    /settings   — Configuración del workspace
    /admin      — Superadmin (role: super_admin)
```

### 3.2 Navegación principal (bottom nav en mobile)

Los módulos principales se acceden desde la barra de navegación inferior en móvil:
- Dashboard (Home)
- CRM
- Operaciones
- Finanzas
- Más (HR, AI Studio, Settings)

En desktop: sidebar lateral colapsable.

---

## 4. PATRONES DE INTERACTION

### 4.1 Formularios

- Validación en tiempo real (no esperar submit)
- Labels visibles siempre (no solo placeholder)
- Campos requeridos marcados con asterisco `*`
- Errores debajo del campo afectado, no al final del formulario
- Submit button deshabilitado mientras carga (`isLoading`)
- Confirmar antes de limpiar formularios con datos (dirty state)

```typescript
// Patrón de formulario estándar
<Form {...form}>
  <FormField name="name" render={({ field }) => (
    <FormItem>
      <FormLabel>Nombre *</FormLabel>
      <FormControl>
        <Input {...field} placeholder="Nombre del cliente" />
      </FormControl>
      <FormMessage />  {/* Muestra error de validación */}
    </FormItem>
  )} />
  <Button type="submit" disabled={isLoading}>
    {isLoading ? <Spinner /> : 'Guardar'}
  </Button>
</Form>
```

### 4.2 Listas y tablas

- Skeleton screens durante carga (no spinners)
- Estado vacío con ilustración + CTA claro
- Paginación o infinite scroll para listas largas
- Búsqueda debounced (300ms) para no bombardear la DB
- Filtros persistidos en URL params para poder compartir/bookmarkear

```typescript
// Estado vacío
if (clients.length === 0) return (
  <EmptyState
    icon={<Users />}
    title="No hay clientes aún"
    description="Agrega tu primer cliente para empezar"
    action={<Button onClick={openCreateModal}>Agregar cliente</Button>}
  />
);
```

### 4.3 Confirmaciones destructivas

Toda acción irreversible (eliminar, cancelar, rechazar) requiere confirmación explícita:

```typescript
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Eliminar cliente</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>¿Eliminar {client.name}?</AlertDialogTitle>
      <AlertDialogDescription>
        Esta acción no se puede deshacer. El cliente y su historial serán archivados.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 4.4 Notificaciones y feedback

```typescript
// Éxito: toast en la esquina inferior
toast({ title: "Cliente creado", description: "Ana García fue agregada exitosamente." });

// Error: toast destructivo
toast({ variant: "destructive", title: "Error", description: "No se pudo guardar." });

// Loading: en el botón que inició la acción
<Button disabled={mutation.isPending}>
  {mutation.isPending ? <Loader2 className="animate-spin" /> : 'Guardar'}
</Button>
```

---

## 5. ACCESIBILIDAD

- Contraste mínimo WCAG AA (4.5:1 para texto normal)
- Todos los elementos interactivos accesibles por teclado
- Labels en todos los inputs (no solo placeholders)
- Estados de foco visibles
- Textos alternativos en imágenes significativas
- No depender solo del color para transmitir información (usar iconos + texto)

---

## 6. FEATURE GATES EN UI

Cuando una función no está disponible por plan:

```typescript
// Patrón: UpgradePrompt component
function PremiumFeature({ children }: { children: ReactNode }) {
  const { hasAccess } = useFeatureAccess('reports_access');

  if (!hasAccess) return (
    <div className="relative opacity-50 pointer-events-none">
      {children}
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
        <UpgradePrompt feature="reportes" requiredPlan="growth" />
      </div>
    </div>
  );

  return children;
}
```

Reglas:
- NUNCA ocultar completamente features — mostrarlas como "disponibles en plan superior"
- El plan requerido debe ser claro
- El CTA de upgrade debe ser visible y accesible

---

## 7. MOBILE — CAPACITOR 8

### 7.1 Safe areas
Respetar safe areas de iOS (notch, home indicator):
```typescript
import { SafeArea } from '@capacitor/core';
// O via CSS: env(safe-area-inset-top)
```

### 7.2 Gestos nativos
- El botón "atrás" de Android debe funcionar correctamente
- Pull-to-refresh en listas
- Swipe para acciones secundarias (si aplica)

### 7.3 Permisos
- Pedir permisos solo cuando se necesitan, no al inicio
- GPS: solo al activar módulo de Campo
- Push notifications: en onboarding, con explicación clara del beneficio
- Cámara/Galería: solo al subir evidencias

---

## 8. PERFORMANCE UX

| Métrica | Target | Herramienta |
|---|---|---|
| Time to Interactive | < 3s en 4G | Lighthouse |
| Largest Contentful Paint | < 2.5s | Lighthouse / Sentry |
| First Input Delay | < 100ms | Lighthouse |
| Cumulative Layout Shift | < 0.1 | Lighthouse |
| Skeleton visible en | < 200ms | — |
| Toast de confirmación en | < 300ms tras acción | — |

---

*Ver: `docs/23_CODING_STANDARDS.md` para convenciones de componentes*
*Ver: `docs/25_PLATFORM_STABILITY_GUIDE.md` para performance budget*
*Ver: `src/components/ui/` para el catálogo de componentes base*
