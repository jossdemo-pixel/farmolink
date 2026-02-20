import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.farmolink.app',
  appName: 'farmolink',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  // Configurações específicas do Android
  android: {
    allowMixedContent: true
  },
  // Permitir acesso a mídia/áudio
  plugins: {
    SplashScreen: {
      launchShowDuration: 0
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
