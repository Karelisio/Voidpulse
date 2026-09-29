import type { CapacitorConfig } from '@capacitor/cli';
import app from './config/app.json';

/** Android uniquement ; l'application tourne entièrement hors ligne (ressources embarquées). */
const config: CapacitorConfig = {
  appId: app.appId,
  appName: app.appName,
  webDir: 'dist',
  android: {
    backgroundColor: '#05010d',
    // Le jeu gère lui-même le bouton retour et l'écran allumé.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#05010d',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_voidpulse',
      iconColor: '#3ee6ff',
    },
  },
};

export default config;
