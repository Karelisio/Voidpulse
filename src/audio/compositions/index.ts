/**
 * Registre des compositions (outil de rendu uniquement : jamais importé par le jeu).
 * Le jeu ne lit que les fichiers pré-rendus décrits par assets/audio/music/tracks.json.
 */
import type { TrackDef } from './lib/types';
import { boss } from './tracks/boss';
import { foretCalm, foretIntense } from './tracks/foret';
import { menu } from './tracks/menu';

export const TRACK_LIST: readonly TrackDef[] = [menu, foretCalm, foretIntense, boss];

export const TRACKS: Readonly<Partial<Record<string, TrackDef>>> = Object.fromEntries(
  TRACK_LIST.map((t) => [t.id, t]),
);
