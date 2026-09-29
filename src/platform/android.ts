/**
 * Intégration Android (Capacitor) : bouton retour, mise en arrière-plan, barres système en mode
 * immersif, écran de démarrage, écran allumé pendant les parties, orientation, couleur Monet.
 * Rien ne s'exécute sur le web.
 */
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { DisplayPrefs } from '../save/schema';
import { setSystemAccent } from '../theme';
import { handleBack } from './back';
import { isNative, VoidpulseNative } from './native';

/** Haptique native pour la classe Haptics du jeu (null sur le web : navigator.vibrate). */
export function nativeHaptics(): {
  impact: (o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void>;
  vibrate: (o: { duration: number }) => Promise<void>;
} | null {
  if (!isNative()) return null;
  return {
    impact: (o) =>
      Haptics.impact({
        style:
          ImpactStyle[o.style === 'LIGHT' ? 'Light' : o.style === 'MEDIUM' ? 'Medium' : 'Heavy'],
      }),
    vibrate: (o) => Haptics.vibrate({ duration: o.duration }),
  };
}

/** Démarrage natif ; `onAccent` réapplique le thème quand la couleur Monet est connue. */
export async function initAndroid(onAccent: () => void): Promise<void> {
  if (!isNative()) return;
  await App.addListener('backButton', () => {
    if (!handleBack()) void App.exitApp();
  });
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Dark });
    await VoidpulseNative.setImmersive({ enabled: true });
  } catch (e) {
    console.warn('Barres système :', e);
  }
  try {
    const { accent } = await VoidpulseNative.systemAccent();
    if (accent) {
      setSystemAccent(accent);
      onAccent();
    }
  } catch {
    /* Android < 12 : pas de couleur Monet */
  }
}

/** Cache l'écran de démarrage (interface prête). */
export function hideSplash(): void {
  if (isNative()) void SplashScreen.hide({ fadeOutDuration: 250 });
}

/** Écran allumé pendant une partie. */
export function keepAwake(on: boolean): void {
  if (!isNative()) return;
  void (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => undefined);
}

/** Verrouille l'orientation choisie (Android) ; sur le web, rien. */
export function applyOrientation(o: DisplayPrefs['orientation']): void {
  if (!isNative()) return;
  const run =
    o === 'auto' ? ScreenOrientation.unlock() : ScreenOrientation.lock({ orientation: o });
  void run.catch(() => undefined);
}
