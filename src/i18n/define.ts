/**
 * Dictionnaire d'un espace de noms : le français fait foi (clés typées), l'anglais doit
 * fournir exactement les mêmes clés (vérifié par le compilateur).
 */
export interface Namespace<K extends string> {
  fr: Record<K, string>;
  en: Record<K, string>;
}

export function defineStrings<const F extends Record<string, string>>(
  fr: F,
  en: Record<keyof F, string>,
): Namespace<keyof F & string> {
  return { fr, en };
}
