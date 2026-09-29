/**
 * Registre des compositions (outil de rendu uniquement : jamais importé par le jeu).
 * Le jeu ne lit que les fichiers pré-rendus décrits par assets/audio/music/tracks.json.
 */
import type { TrackDef } from './lib/types';
import { boss } from './tracks/boss';
import { cathedraleCalm, cathedraleIntense } from './tracks/cathedrale';
import { citeCalm, citeIntense } from './tracks/cite';
import { desertCalm, desertIntense } from './tracks/desert';
import { endOfRun } from './tracks/fin';
import { finalBoss } from './tracks/final';
import { foretCalm, foretIntense } from './tracks/foret';
import { maraisCalm, maraisIntense } from './tracks/marais';
import { menu } from './tracks/menu';
import { stationCalm, stationIntense } from './tracks/station';
import { toundraCalm, toundraIntense } from './tracks/toundra';
import { volcanCalm, volcanIntense } from './tracks/volcan';

export const TRACK_LIST: readonly TrackDef[] = [
  menu,
  foretCalm,
  foretIntense,
  desertCalm,
  desertIntense,
  citeCalm,
  citeIntense,
  volcanCalm,
  volcanIntense,
  stationCalm,
  stationIntense,
  toundraCalm,
  toundraIntense,
  maraisCalm,
  maraisIntense,
  cathedraleCalm,
  cathedraleIntense,
  boss,
  finalBoss,
  endOfRun,
];

export const TRACKS: Readonly<Partial<Record<string, TrackDef>>> = Object.fromEntries(
  TRACK_LIST.map((t) => [t.id, t]),
);
