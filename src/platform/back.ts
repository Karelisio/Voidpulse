/**
 * Bouton retour d'Android : pile de gestionnaires (le plus récent d'abord). Un gestionnaire
 * renvoie true s'il a consommé l'appui (fermer une surcouche, mettre en pause…). Sinon, la
 * navigation revient à l'écran précédent ; depuis l'accueil, l'application se ferme.
 */
import { useEffect, useRef } from 'react';

type Handler = () => boolean;
const stack: { fn: () => boolean }[] = [];

/** Déclare un gestionnaire tant que le composant est monté (et `active` vrai). */
export function useBackHandler(fn: Handler, active = true): void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    const entry = { fn: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/** Traite un appui ; renvoie false quand rien ne l'a consommé (quitter l'application). */
export function handleBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].fn()) return true;
  return false;
}
