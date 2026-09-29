/** Accès unique au moteur audio (créé au lancement, repris au premier geste). */
import { AudioEngine } from './engine';

declare global {
  interface Window {
    /** Accès debug au moteur audio (outils de mesure). */
    __voidpulseAudio?: AudioEngine;
  }
}

let pending: Promise<AudioEngine | null> | null = null;
let engine: AudioEngine | null = null;

export function initAudio(): Promise<AudioEngine | null> {
  pending ??= AudioEngine.create().then(
    (e) => {
      engine = e;
      window.__voidpulseAudio = e;
      return e;
    },
    (err: unknown) => {
      console.warn('Audio indisponible :', err);
      return null;
    },
  );
  return pending;
}

/** Moteur déjà prêt, ou null. */
export function audio(): AudioEngine | null {
  return engine;
}
