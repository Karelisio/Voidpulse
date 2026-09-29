/**
 * Contrat entre le moteur et la musique : `assets/audio/music/tracks.json` (voir
 * docs/ARCHITECTURE.md §11.4). Validation à l'exécution (le fichier est remplaçable sans
 * toucher au code), résolution des liaisons et grille des mesures.
 */

export const MUSIC_RATE = 48000;

export interface StemDef {
  layer: string;
  /** Fichier boucle (layout split) ou fichier complet (layout single), relatif à music/. */
  file: string;
  /** Fichier intro optionnel (layout split). */
  intro?: string;
  /** Palier d'intensité (0-3) à partir duquel la couche joue. */
  enterAt: number;
}

export interface TrackDef {
  id: string;
  title: string;
  layout: 'split' | 'single';
  bpm: number;
  timeSignature: [number, number];
  gainDb: number;
  loopStart: number;
  loopEnd: number;
  /** Pistes d'un même groupe : jouées en phase (calme / intense). */
  group?: string;
  stems: StemDef[];
}

export interface StageBinding {
  calm: string;
  intense: string;
}

export interface Bindings {
  menu: string;
  stages: Partial<Record<string, StageBinding>>;
  boss: string;
  finalBoss: string;
  endOfRun: string;
}

export interface MusicManifest {
  tracks: TrackDef[];
  bindings: Bindings;
}

function fail(msg: string): never {
  throw new Error(`tracks.json : ${msg}`);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, what: string): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(`${what} doit être un nombre`);
const str = (v: unknown, what: string): string =>
  typeof v === 'string' && v.length > 0 ? v : fail(`${what} doit être une chaîne`);

function parseStem(v: unknown, where: string, layout: TrackDef['layout']): StemDef {
  if (!isObj(v)) fail(`${where} : stem invalide`);
  const enterAt = v.enterAt === undefined ? 0 : num(v.enterAt, `${where}.enterAt`);
  if (enterAt < 0 || enterAt > 3 || !Number.isInteger(enterAt))
    fail(`${where}.enterAt doit valoir 0 à 3`);
  const stem: StemDef = {
    layer: str(v.layer, `${where}.layer`),
    file: str(v.file, `${where}.file`),
    enterAt,
  };
  if (v.intro !== undefined) {
    if (layout !== 'split') fail(`${where}.intro n'existe qu'en layout split`);
    stem.intro = str(v.intro, `${where}.intro`);
  }
  return stem;
}

function parseTrack(v: unknown, i: number): TrackDef {
  if (!isObj(v)) fail(`piste ${i} invalide`);
  const id = str(v.id, `tracks[${i}].id`);
  const where = `piste « ${id} »`;
  const layout = v.layout ?? 'single';
  if (layout !== 'split' && layout !== 'single') fail(`${where} : layout inconnu`);
  const sig = v.timeSignature ?? [4, 4];
  if (!Array.isArray(sig) || sig.length !== 2) fail(`${where} : timeSignature invalide`);
  const track: TrackDef = {
    id,
    title: typeof v.title === 'string' ? v.title : id,
    layout,
    bpm: num(v.bpm, `${where}.bpm`),
    timeSignature: [num(sig[0], `${where}.timeSignature`), num(sig[1], `${where}.timeSignature`)],
    gainDb: v.gainDb === undefined ? 0 : num(v.gainDb, `${where}.gainDb`),
    loopStart: num(v.loopStart, `${where}.loopStart`),
    loopEnd: num(v.loopEnd, `${where}.loopEnd`),
    stems: [],
  };
  if (typeof v.group === 'string') track.group = v.group;
  if (track.bpm <= 0) fail(`${where} : bpm doit être positif`);
  if (track.loopStart < 0 || track.loopEnd <= track.loopStart)
    fail(`${where} : points de boucle invalides`);
  if (!Array.isArray(v.stems) || v.stems.length === 0) fail(`${where} : aucun stem`);
  track.stems = v.stems.map((s, j) => parseStem(s, `${where}.stems[${j}]`, layout));
  return track;
}

export function parseManifest(json: unknown): MusicManifest {
  if (!isObj(json)) fail('racine invalide');
  if (json.version !== 1) fail('version non prise en charge');
  if (!Array.isArray(json.tracks)) fail('tracks manquant');
  const tracks = json.tracks.map(parseTrack);
  const ids = new Set<string>();
  for (const t of tracks) {
    if (ids.has(t.id)) fail(`piste « ${t.id} » en double`);
    ids.add(t.id);
  }
  const b = json.bindings;
  if (!isObj(b)) fail('bindings manquant');
  const ref = (v: unknown, what: string): string => {
    const id = str(v, what);
    if (!ids.has(id)) fail(`${what} pointe vers une piste inconnue « ${id} »`);
    return id;
  };
  const stages: Record<string, StageBinding | undefined> = {};
  if (!isObj(b.stages)) fail('bindings.stages manquant');
  for (const [k, s] of Object.entries(b.stages)) {
    if (!isObj(s)) fail(`bindings.stages.${k} invalide`);
    stages[k] = {
      calm: ref(s.calm, `bindings.stages.${k}.calm`),
      intense: ref(s.intense, `bindings.stages.${k}.intense`),
    };
  }
  const manifest: MusicManifest = {
    tracks,
    bindings: {
      menu: ref(b.menu, 'bindings.menu'),
      stages,
      boss: ref(b.boss, 'bindings.boss'),
      finalBoss: ref(b.finalBoss ?? b.boss, 'bindings.finalBoss'),
      endOfRun: ref(b.endOfRun ?? b.menu, 'bindings.endOfRun'),
    },
  };
  // Les pistes jouées ensemble (calme / intense) doivent partager la même grille.
  for (const s of Object.values(stages)) {
    if (!s) continue;
    const calm = trackById(manifest, s.calm);
    const intense = trackById(manifest, s.intense);
    if (calm !== intense && !sameGrid(calm, intense)) {
      fail(`« ${calm.id} » et « ${intense.id} » doivent partager BPM, mesure et points de boucle`);
    }
  }
  return manifest;
}

export function trackById(m: MusicManifest, id: string): TrackDef {
  const t = m.tracks.find((x) => x.id === id);
  if (!t) throw new Error(`Piste inconnue : ${id}`);
  return t;
}

export function sameGrid(a: TrackDef, b: TrackDef): boolean {
  const eq = (x: number, y: number): boolean => Math.abs(x - y) < 1e-3;
  return (
    eq(a.bpm, b.bpm) &&
    a.timeSignature[0] === b.timeSignature[0] &&
    a.timeSignature[1] === b.timeSignature[1] &&
    eq(a.loopStart, b.loopStart) &&
    eq(a.loopEnd, b.loopEnd)
  );
}

/** Liaison de stage (retombe sur le stage 1, puis sur le premier stage lié). */
export function stageBinding(m: MusicManifest, stage: number): StageBinding {
  const s =
    m.bindings.stages[String(stage)] ??
    m.bindings.stages['1'] ??
    Object.values(m.bindings.stages)[0];
  if (!s) throw new Error('Aucune musique de stage liée');
  return s;
}

/** Durée d'une mesure en échantillons (48 kHz). */
export function barFrames(t: TrackDef): number {
  const beat = (60 / t.bpm) * (4 / t.timeSignature[1]);
  return beat * t.timeSignature[0] * MUSIC_RATE;
}

/** Position (échantillons de piste) de la première barre de mesure ≥ pos + marge. */
export function nextBar(t: TrackDef, pos: number, margin: number): number {
  const bar = barFrames(t);
  return Math.max(0, Math.ceil((pos + margin) / bar - 1e-9)) * bar;
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}
