import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shelwi.app',
  appName: 'Shelwi',
  webDir: 'dist',

  // Servidor de desarrollo (web)
  server: {
    // En producción nativa no usar server.url — cargar desde webDir
    // androidScheme: 'https',
  },

  // iOS
  ios: {
    // scheme personalizado para deep links
    // configurar App Links en Xcode con associated domains
  },

  // Android
  android: {
    // App Links y scheme configurados en AndroidManifest.xml
  },

  plugins: {
    // Capacitor Browser — para links externos (MercadoPago, OAuth, WhatsApp)
    Browser: {
      // Configuración por defecto es suficiente
    },

    // Capacitor App — deep links y state change
    App: {
      // Se registra listener en src/lib/capacitorBridge.ts
    },

    // Capacitor Geolocation — GPS nativo
    Geolocation: {
      // Sin configuración adicional; permisos en AndroidManifest + Info.plist
    },

    // Capacitor Camera — cámara nativa
    Camera: {
      // Permisos en AndroidManifest + Info.plist
    },

    // Capacitor Preferences — reemplaza localStorage para datos críticos
    Preferences: {
      // group: 'shelwi' — agrupa en iOS Keychain
    },

    // Push Notifications — preparado para Firebase (Phase 2)
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // Filesystem — para evidencias offline
    Filesystem: {
      // directory: Directory.Data por defecto
    },

    // Network — detección online/offline
    Network: {
      // Sin configuración adicional
    },
  },
};

export default config;
