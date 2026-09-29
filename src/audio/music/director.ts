/**
 * Directeur musical : choisit la musique de la scène (menu, stage, boss, fin de run), gère les
 * transitions calées sur la mesure et la montée des couches selon l'intensité (paliers appliqués
 * à la mesure suivante, au moins 2 mesures par palier, bascule calme → intense sur 2 mesures).
 */
import { IntensityDirector, stemTargets } from './intensity';
import { barFrames, stageBinding, trackById, type MusicManifest, type TrackDef } from './manifest';
import type { MusicPlayer, OpenDeck } from './player';

export type MusicScene = 'menu' | 'stage' | 'boss' | 'end';

/** Demi-ton de l'Éveil. */
export const EVEIL_RATE = 2 ** (1 / 12);
/** Faille temporelle : la musique ralentit (−3 demi-tons, tempo réduit d'autant). */
export const RIFT_RATE = 2 ** (-3 / 12);

export interface MusicDebug {
  scene: MusicScene | null;
  raw: number;
  value: number;
  tier: number;
  appliedTier: number;
  layers: string[];
  targets: number[];
  levels: number[];
  underruns: number;
  streaming: boolean;
}

export class MusicDirector {
  readonly intensity = new IntensityDirector();
  private current: OpenDeck | null = null;
  private scene: MusicScene | null = null;
  private sceneKey = '';
  private prepared = new Map<string, OpenDeck>();
  private appliedTier = 0;
  private targets: Float32Array = new Float32Array(0);
  private holdUntil = 0;
  private raw = 0;
  /** Numéro de transition : une transition plus récente annule l'attente d'une plus ancienne. */
  private generation = 0;

  constructor(
    private readonly player: MusicPlayer,
    private readonly manifest: MusicManifest,
  ) {}

  private tracksFor(scene: MusicScene, stage: number): TrackDef[] {
    const m = this.manifest;
    switch (scene) {
      case 'menu':
        return [trackById(m, m.bindings.menu)];
      case 'end':
        return [trackById(m, m.bindings.endOfRun)];
      case 'boss':
        return [trackById(m, m.bindings.boss)];
      case 'stage': {
        const b = stageBinding(m, stage);
        return b.calm === b.intense
          ? [trackById(m, b.calm)]
          : [trackById(m, b.calm), trackById(m, b.intense)];
      }
    }
  }

  private key(scene: MusicScene, stage: number): string {
    return `${scene}:${this.tracksFor(scene, stage)
      .map((t) => t.id)
      .join('+')}`;
  }

  private openDeck(scene: MusicScene, stage: number, tier: number): OpenDeck {
    const tracks = this.tracksFor(scene, stage);
    const enterAt = tracks.flatMap((t) => t.stems.map((s) => s.enterAt));
    return this.player.open(tracks, stemTargets(enterAt, tracks[0].stems.length, tier), 0);
  }

  /** Précharge la musique d'une scène à venir (ex. le boss pendant le stage). */
  prepare(scene: MusicScene, stage = 1): void {
    const key = this.key(scene, stage);
    if (key === this.sceneKey || this.prepared.has(key)) return;
    this.prepared.set(key, this.openDeck(scene, stage, 0));
  }

  /** Passe à la musique d'une scène (fondu enchaîné sur la mesure). */
  async play(scene: MusicScene, stage = 1): Promise<void> {
    const key = this.key(scene, stage);
    this.scene = scene;
    if (key === this.sceneKey) return;
    this.sceneKey = key;
    const gen = ++this.generation;
    const tier = scene === 'boss' ? Math.max(1, this.intensity.tier) : this.intensity.tier;
    let deck = this.prepared.get(key);
    this.prepared.delete(key);
    deck ??= this.openDeck(scene, stage, tier);
    try {
      await deck.ready;
    } catch (e) {
      console.warn('Musique indisponible :', e);
      return;
    }
    if (gen !== this.generation) {
      // Une autre scène a été demandée entre-temps : ce deck repart en réserve.
      this.prepared.set(key, deck);
      return;
    }
    const old = this.current;
    const p = this.player;
    this.current = deck;
    this.appliedTier = -1;
    this.targets = new Float32Array(deck.enterAt.length).fill(-1);
    this.applyTier(tier, -1, 0.01);
    if (old?.started) {
      const at = p.start(deck, old);
      const bar = p.barSeconds(old);
      const fade = Math.max(1.2, bar);
      const oldBar = p.nextBar(old);
      p.ramp(deck, -1, 1, 0, fade);
      p.ramp(old, -1, 0, oldBar, fade);
      p.stop(old, (at - p.frameNow) / 48000 + fade + 0.3);
    } else {
      if (old) p.stop(old, 0);
      p.start(deck, null);
      p.ramp(deck, -1, 1, 0, scene === 'menu' ? 2.5 : 0.8);
    }
    this.holdUntil = 0;
  }

  /** Coupe tout (fondu). */
  stopAll(seconds = 1): void {
    this.generation++;
    const d = this.current;
    if (d) {
      this.player.ramp(d, -1, 0, -1, seconds);
      this.player.stop(d, seconds + 0.2);
    }
    this.current = null;
    this.scene = null;
    this.sceneKey = '';
  }

  private applyTier(tier: number, at: number, fadeIn: number): void {
    const d = this.current;
    if (!d) return;
    const next = stemTargets(d.enterAt, d.calmCount, tier);
    const barSec = this.player.barSeconds(d);
    const crossing =
      d.calmCount < d.enterAt.length &&
      tier >= 3 !== this.appliedTier >= 3 &&
      this.appliedTier >= 0;
    for (let i = 0; i < next.length; i++) {
      if (next[i] === this.targets[i]) continue;
      const seconds = crossing ? barSec * 2 : next[i] > 0 ? fadeIn : barSec;
      this.player.ramp(d, i, next[i], at, seconds);
    }
    this.targets = next;
    this.appliedTier = tier;
  }

  /** À chaque frame : intensité brute (0-1) → palier appliqué à la mesure. */
  update(raw: number, dt: number): void {
    this.raw = raw;
    const tier = this.intensity.update(raw, dt);
    const d = this.current;
    if (!d?.started || tier === this.appliedTier) return;
    const pos = this.player.position(d.id);
    if (pos < 0 || pos < this.holdUntil) return;
    const at = this.player.nextBar(d);
    if (at < 0) return;
    this.applyTier(tier, at, this.player.barSeconds(d) * 0.25);
    this.holdUntil = at + 2 * barFrames(d.grid);
  }

  /** Éveil : pitch +1 demi-ton (les effets de bus sont gérés par le moteur). */
  setEveil(on: boolean): void {
    this.eveilOn = on;
    this.applyRate(on ? 0.35 : 0.8);
  }

  /** Temps suspendu : ralenti (prioritaire sur l'Éveil). */
  setRift(on: boolean): void {
    this.riftOn = on;
    this.applyRate(on ? 0.6 : 0.9);
  }

  private eveilOn = false;
  private riftOn = false;

  private applyRate(seconds: number): void {
    this.player.setRate(this.riftOn ? RIFT_RATE : this.eveilOn ? EVEIL_RATE : 1, seconds);
  }

  get currentScene(): MusicScene | null {
    return this.scene;
  }

  debug(): MusicDebug {
    const d = this.current;
    const r = this.player.report;
    const rep = d ? r?.decks.find((x) => x.id === d.id) : undefined;
    return {
      scene: this.scene,
      raw: this.raw,
      value: this.intensity.value,
      tier: this.intensity.tier,
      appliedTier: this.appliedTier,
      layers: d
        ? d.tracks.flatMap((t, ti) => t.stems.map((s) => (ti > 0 ? `${s.layer}+` : s.layer)))
        : [],
      targets: Array.from(this.targets),
      levels: rep ? rep.levels : [],
      underruns: r?.underruns ?? 0,
      streaming: this.player.streaming,
    };
  }
}
