import { LegalPageLayout, LegalSection } from './LegalPageLayout';
import { APP_NAME } from '../../lib/brand';

export function Terms() {
  return (
    <LegalPageLayout title="Términos de servicio" updatedAt="11 de junio de 2026">
      <LegalSection title="1. Introducción">
        <p>
          Estos Términos de servicio regulan el uso de la plataforma {APP_NAME} ("la Plataforma"). Al crear una cuenta o
          utilizar nuestros servicios, aceptas estas condiciones en su totalidad.
        </p>
      </LegalSection>

      <LegalSection title="2. Uso de la plataforma">
        <p>
          {APP_NAME} es una herramienta para crear, gestionar y compartir cotizaciones comerciales. Te comprometes a usar la
          Plataforma de forma lícita, sin vulnerar derechos de terceros ni interferir con su funcionamiento.
        </p>
      </LegalSection>

      <LegalSection title="3. Responsabilidades del usuario">
        <ul>
          <li>Eres responsable de la veracidad de la información que registras (clientes, materiales, precios y cotizaciones).</li>
          <li>Debes mantener la confidencialidad de tus credenciales de acceso.</li>
          <li>Eres responsable de las acciones realizadas dentro de tu cuenta y de los usuarios que invites a tu espacio de trabajo.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Planes y suscripciones">
        <p>
          {APP_NAME} ofrece planes FREE, PRO y PREMIUM con distintas funcionalidades y límites de uso. Las características de
          cada plan se describen en la página de Planes y pueden actualizarse con previo aviso.
        </p>
      </LegalSection>

      <LegalSection title="5. Facturación">
        <p>
          Los planes pagos se facturan de forma mensual o anual, según la modalidad elegida. Los pagos se procesan a través de
          pasarelas de pago de terceros (como Mercado Pago). Los precios pueden estar sujetos a impuestos aplicables según tu
          jurisdicción.
        </p>
      </LegalSection>

      <LegalSection title="6. Limitación de responsabilidad">
        <p>
          {APP_NAME} actúa como plataforma tecnológica. No somos responsables por las decisiones comerciales tomadas a partir
          de las cotizaciones generadas, ni por pérdidas indirectas derivadas del uso o la imposibilidad de uso de la
          Plataforma.
        </p>
      </LegalSection>

      <LegalSection title="7. Cancelación">
        <p>
          Puedes cancelar tu suscripción en cualquier momento desde la sección de Planes. La cancelación tendrá efecto al
          finalizar el periodo de facturación vigente, sin generar cargos adicionales.
        </p>
      </LegalSection>

      <LegalSection title="8. Contacto">
        <p>
          Si tienes dudas sobre estos Términos de servicio, puedes escribirnos a{' '}
          <a href="mailto:soporte@shelwi.com">soporte@shelwi.com</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
