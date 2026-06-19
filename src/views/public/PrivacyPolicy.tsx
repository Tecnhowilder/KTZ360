import { LegalPageLayout, LegalSection } from './LegalPageLayout';
import { APP_NAME } from '../../lib/brand';

export function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Política de privacidad" updatedAt="11 de junio de 2026">
      <LegalSection title="1. Datos recopilados">
        <p>
          Recopilamos los datos que proporcionas al registrarte y usar {APP_NAME}: nombre, correo electrónico, datos de tu
          empresa, clientes, materiales y cotizaciones que registras en la Plataforma.
        </p>
      </LegalSection>

      <LegalSection title="2. Uso de la información">
        <ul>
          <li>Proveer y mantener el funcionamiento de la Plataforma.</li>
          <li>Procesar pagos y gestionar tu suscripción.</li>
          <li>Enviarte notificaciones relacionadas con tu cuenta y tus cotizaciones.</li>
          <li>Mejorar nuestros productos y la experiencia de usuario.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Cookies">
        <p>
          Utilizamos cookies y tecnologías similares para mantener tu sesión activa, recordar tus preferencias y analizar el
          uso de la Plataforma. Puedes gestionar las cookies desde la configuración de tu navegador.
        </p>
      </LegalSection>

      <LegalSection title="4. Seguridad">
        <p>
          Implementamos medidas técnicas y organizativas para proteger tus datos, incluyendo cifrado en tránsito, control de
          acceso basado en roles y separación de datos por espacio de trabajo.
        </p>
      </LegalSection>

      <LegalSection title="5. Retención de datos">
        <p>
          Conservamos tu información mientras tu cuenta esté activa. Si solicitas la eliminación de tu cuenta, eliminaremos o
          anonimizaremos tus datos personales, salvo que debamos conservarlos para cumplir obligaciones legales.
        </p>
      </LegalSection>

      <LegalSection title="6. Derechos del usuario">
        <p>
          Puedes acceder, corregir o solicitar la eliminación de tus datos personales en cualquier momento, escribiéndonos a
          través de los canales de contacto indicados a continuación.
        </p>
      </LegalSection>

      <LegalSection title="7. Contacto">
        <p>
          Para ejercer tus derechos o realizar consultas sobre privacidad, escríbenos a{' '}
          <a href="mailto:soporte@shelwi.com">soporte@shelwi.com</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
