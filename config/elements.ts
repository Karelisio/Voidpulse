/** Éléments de la Résonance, dans l'ordre de leur index (utilisé par les tableaux SoA). */
export const ELEMENTS = ['fire', 'frost', 'lightning', 'poison', 'arcane', 'void'] as const;
export type ElementId = (typeof ELEMENTS)[number];
