/**
 * roleOnboarding.ts — Sistema de Onboarding Diferenciado por Rol
 *
 * Fuente única de verdad para el contenido del onboarding.
 * Escalable: agregar un rol nuevo = agregar una clave en ROLE_SLIDES.
 *
 * Roles soportados: owner, admin, employee, supervisor, comercial, operario
 * Roles sin onboarding: super_admin, support_admin (saltan automáticamente)
 *
 * Todas las imágenes reutilizan /images/onboarding/ existentes.
 * Para personalizar: reemplazar los paths de imagen sin cambiar lógica.
 */

export interface OnboardingSlide {
  image:       string;
  title:       string;
  description: string;
}

export type OnboardingRole =
  | 'owner' | 'admin' | 'employee'
  | 'supervisor' | 'comercial' | 'operario'
  | 'super_admin' | 'support_admin';

// Roles que NO necesitan onboarding (van directo a su destino)
export const SKIP_ONBOARDING_ROLES: OnboardingRole[] = ['super_admin', 'support_admin'];

// ─── Slides por rol ───────────────────────────────────────────────────────────

export const ROLE_SLIDES: Record<OnboardingRole, OnboardingSlide[]> = {

  // ─── OWNER: onboarding completo de configuración del negocio ──────────────
  owner: [
    {
      image:       '/images/onboarding/img1.png',
      title:       'Crea cotizaciones profesionales',
      description: 'Diseña cotizaciones claras, personalizadas y listas para impresionar a tus clientes.',
    },
    {
      image:       '/images/onboarding/img2.png',
      title:       'Organiza y gestiona todo en un solo lugar',
      description: 'Administra clientes, productos y servicios de forma simple y eficiente.',
    },
    {
      image:       '/images/onboarding/img3.png',
      title:       'Recibe notificaciones y nunca pierdas el control',
      description: 'Mantente al tanto de cada actualización de tus cotizaciones en tiempo real.',
    },
  ],

  // ─── ADMIN: gestión operativa sin configuración de empresa ────────────────
  admin: [
    {
      image:       '/images/onboarding/img2.png',
      title:       'Gestiona el equipo y las operaciones',
      description: 'Como administrador tienes acceso a clientes, cotizaciones, pedidos y reportes para mantener todo en marcha.',
    },
    {
      image:       '/images/onboarding/img1.png',
      title:       'Cotizaciones y pipeline comercial',
      description: 'Crea y gestiona cotizaciones, haz seguimiento a clientes y convierte oportunidades en pedidos.',
    },
    {
      image:       '/images/onboarding/img3.png',
      title:       'Reportes y métricas en tiempo real',
      description: 'Accede a dashboards operativos y toma decisiones basadas en datos reales.',
    },
  ],

  // ─── EMPLOYEE: operaciones de campo sin acceso a configuración ────────────
  employee: [
    {
      image:       '/images/onboarding/img3.png',
      title:       'Tus tareas asignadas en un solo lugar',
      description: 'Revisa las órdenes de trabajo que te han asignado y mantente al tanto de tus responsabilidades del día.',
    },
    {
      image:       '/images/onboarding/img2.png',
      title:       'Registra evidencias y avances',
      description: 'Sube fotos, registra el progreso y actualiza el estado de cada tarea directamente desde tu móvil.',
    },
    {
      image:       '/images/onboarding/img1.png',
      title:       'Conectado con tu equipo en todo momento',
      description: 'Recibe actualizaciones instantáneas, comunica avances y nunca pierdas el hilo de tu trabajo.',
    },
  ],

  // ─── SUPERVISOR: gestión de equipo y productividad operativa ─────────────
  supervisor: [
    {
      image:       '/images/onboarding/img2.png',
      title:       'Supervisa tu equipo en tiempo real',
      description: 'Visualiza el estado de todos los operarios, sus órdenes de trabajo y su ubicación en el mapa operativo.',
    },
    {
      image:       '/images/onboarding/img1.png',
      title:       'Órdenes de trabajo y productividad',
      description: 'Asigna tareas, monitorea el progreso y asegura que los pedidos se completen a tiempo.',
    },
    {
      image:       '/images/onboarding/img3.png',
      title:       'Alertas y control de calidad',
      description: 'Recibe alertas cuando una OT se retrasa y revisa las evidencias enviadas por el equipo de campo.',
    },
  ],

  // ─── COMERCIAL: CRM, pipeline y cotizaciones ──────────────────────────────
  comercial: [
    {
      image:       '/images/onboarding/img1.png',
      title:       'Tu pipeline comercial, siempre claro',
      description: 'Gestiona clientes, cotizaciones y oportunidades en un kanban visual que te muestra exactamente dónde está cada negocio.',
    },
    {
      image:       '/images/onboarding/img2.png',
      title:       'Crea cotizaciones que cierran',
      description: 'Diseña propuestas profesionales en minutos, compártelas por WhatsApp o correo y recibe notificaciones cuando el cliente las abre.',
    },
    {
      image:       '/images/onboarding/img3.png',
      title:       'IA para vender más',
      description: 'Usa Shelwi IA para mejorar tus propuestas, calcular probabilidades de cierre y recibir recomendaciones personalizadas.',
    },
  ],

  // ─── OPERARIO: tareas de campo, check-in/out y evidencias ────────────────
  operario: [
    {
      image:       '/images/onboarding/img3.png',
      title:       'Tus órdenes de trabajo del día',
      description: 'Revisa las tareas asignadas, su prioridad y la información necesaria para ejecutarlas con precisión.',
    },
    {
      image:       '/images/onboarding/img2.png',
      title:       'Check in / Check out en cada OT',
      description: 'Registra tu llegada y salida en cada orden de trabajo para mantener el control de tiempo y avance.',
    },
    {
      image:       '/images/onboarding/img1.png',
      title:       'Evidencias en tiempo real',
      description: 'Sube fotos del trabajo realizado directamente desde la app y completa tus órdenes con un solo toque.',
    },
  ],

  // Roles sin onboarding (array vacío = saltar automáticamente)
  super_admin:   [],
  support_admin: [],
};

/**
 * Obtiene los slides para un rol dado.
 * Si el rol no existe o es admin del sistema, retorna array vacío (skip).
 */
export function getSlidesForRole(role: string): OnboardingSlide[] {
  return ROLE_SLIDES[role as OnboardingRole] ?? ROLE_SLIDES['employee'];
}

/**
 * Determina si un rol debe saltarse el onboarding completamente.
 */
export function shouldSkipOnboarding(role: string): boolean {
  return SKIP_ONBOARDING_ROLES.includes(role as OnboardingRole);
}
