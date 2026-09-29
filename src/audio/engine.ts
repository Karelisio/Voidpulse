/**
 * Moteur audio : contexte, bus (Musique, Effets, UI, Ambiance), chaîne musicale (passe-bas,
 * saturation, réverbération, ducking), master (EQ graves/aigus, compresseur, limiteur),
 * réglages, suspension en arrière-plan. Voir docs/ARCHITECTURE.md §11.1.
 */
import tracksJson from '../../assets/audio/music/tracks.json';
import { type EndMode, MusicDirector } from './music/director';
import { parseManifest } from './music/manifest';
import { MusicPlayer } from './music/player';
import { SfxEngine, type BusName, type SfxManifest } from './sfx';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ui: number;
  ambience: number;
  /** Égaliseur master, en dB (±12). */
  bassDb: number;
  trebleDb: number;
  headphones: boolean;
  muted: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = {
  master: 0.9,
  music: 0.75,
  sfx: 0.9,
  ui: 0.8,
  ambience: 0.7,
  bassDb: 0,
  trebleDb: 0,
  headphones: false,
  muted: false,
};

const SFX_MANIFESTS = import.meta.glob<SfxManifest>('../../assets/audio/sfx/sfx.json', {
  import: 'default',
  eager: true,
});

/** Réponse impulsionnelle synthétique (salle sombre, ~1,8 s). */
function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const n = Math.round(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.38 * t);
      d[i] = lp * (1 - t) ** 2.2 * Math.exp(-3 * t);
    }
  }
  return buf;
}

function saturationCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly buses: Record<BusName | 'music', GainNode>;
  readonly sfx: SfxEngine;
  music: MusicDirector | null = null;
  settings: AudioSettings = { ...DEFAULT_AUDIO };
  private readonly master: GainNode;
  private readonly bass: BiquadFilterNode;
  private readonly treble: BiquadFilterNode;
  private readonly lowpass: BiquadFilterNode;
  private readonly satDry: GainNode;
  private readonly satWet: GainNode;
  private readonly reverbWet: GainNode;
  private readonly duckGain: GainNode;
  private readonly musicIn: GainNode;
  private paused = false;
  private eveil = false;
  private rift = false;
  private endMode: EndMode | null = null;
  private tone = 0;
  private hidden = false;

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const g = (v = 1): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    // Master : pré-atténuation (compense le gain de rattrapage du compresseur), EQ, dynamique.
    const pre = g(0.7);
    this.bass = ctx.createBiquadFilter();
    this.bass.type = 'lowshelf';
    this.bass.frequency.value = 140;
    this.treble = ctx.createBiquadFilter();
    this.treble.type = 'highshelf';
    this.treble.frequency.value = 6000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 1.8;
    comp.knee.value = 10;
    comp.attack.value = 0.012;
    comp.release.value = 0.25;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.ratio.value = 20;
    limiter.knee.value = 0;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    this.master = g();
    pre
      .connect(this.bass)
      .connect(this.treble)
      .connect(comp)
      .connect(limiter)
      .connect(this.master)
      .connect(ctx.destination);

    this.buses = { music: g(), sfx: g(), ui: g(), ambience: g() };
    for (const b of Object.values(this.buses)) b.connect(pre);

    // Chaîne musicale : entrée → passe-bas → saturation (sèche / humide) → réverb → ducking → bus.
    this.musicIn = g();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.lowpass.Q.value = 0.5;
    this.satDry = g(1);
    this.satWet = g(0);
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(2.4);
    shaper.oversample = '2x';
    const satSum = g();
    this.musicIn.connect(this.lowpass);
    this.lowpass.connect(this.satDry).connect(satSum);
    this.lowpass.connect(shaper).connect(this.satWet).connect(satSum);
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 1.8);
    this.reverbWet = g(0.12);
    this.duckGain = g();
    satSum.connect(this.duckGain);
    satSum.connect(reverb).connect(this.reverbWet).connect(this.duckGain);
    this.duckGain.connect(this.buses.music);

    this.sfx = new SfxEngine(ctx, this.buses);
    this.apply();
  }

  static async create(): Promise<AudioEngine> {
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    } catch {
      ctx = new AudioContext({ latencyHint: 'interactive' });
    }
    const engine = new AudioEngine(ctx);
    engine.installLifecycle();
    try {
      const player = await MusicPlayer.create(ctx);
      player.node.connect(engine.musicIn);
      const music = new MusicDirector(player, parseManifest(tracksJson));
      music.onEndMode = (mode) => {
        engine.setEndMode(mode);
      };
      engine.music = music;
    } catch (e) {
      console.warn('Musique désactivée :', e);
    }
    const sfx = Object.values(SFX_MANIFESTS)[0] as SfxManifest | undefined;
    if (sfx) await engine.sfx.load(sfx);
    return engine;
  }

  /** Reprise au premier geste (politique d'autoplay) et suspension en arrière-plan. */
  private installLifecycle(): void {
    const unlock = (): void => {
      if (!this.hidden && this.ctx.state === 'suspended') void this.ctx.resume();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend'])
      window.addEventListener(ev, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      this.setHidden(document.hidden);
    });
  }

  /** Application en arrière-plan : contexte suspendu (plus aucun calcul audio). */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  apply(s: Partial<AudioSettings> = {}): void {
    this.settings = { ...this.settings, ...s };
    const st = this.settings;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number): void => {
      p.setTargetAtTime(v, t, 0.03);
    };
    // Courbe de volume perceptive (x²).
    set(this.master.gain, st.muted ? 0 : st.master * st.master);
    set(this.buses.music.gain, st.music * st.music);
    set(this.buses.sfx.gain, st.sfx * st.sfx);
    set(this.buses.ui.gain, st.ui * st.ui);
    set(this.buses.ambience.gain, st.ambience * st.ambience);
    set(this.bass.gain, Math.max(-12, Math.min(12, st.bassDb)));
    set(this.treble.gain, Math.max(-12, Math.min(12, st.trebleDb)));
    this.sfx.setHeadphones(st.headphones);
  }

  /** Couleur de la musique selon l'intensité lissée (0-1) : filtre et réverbération. */
  setTone(intensity: number): void {
    this.tone = intensity;
    this.updateMusicFx(0.25);
  }

  /** Pause et menus en jeu : musique étouffée et atténuée, jamais coupée. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.updateMusicFx(0.15);
  }

  /** Éveil : filtre ouvert, saturation, (pitch géré par le directeur musical). */
  setEveil(on: boolean): void {
    this.eveil = on;
    this.music?.setEveil(on);
    this.updateMusicFx(on ? 0.08 : 0.4);
  }

  /** Fin de run : victoire = filtre grand ouvert ; défaite = passe-bas, plus de réverb. */
  setEndMode(mode: EndMode | null): void {
    if (mode === this.endMode) return;
    this.endMode = mode;
    this.updateMusicFx(mode ? 1.2 : 0.4);
  }

  /** Faille temporelle : musique ralentie, feutrée, plus réverbérée. */
  setRift(on: boolean): void {
    if (on === this.rift) return;
    this.rift = on;
    this.music?.setRift(on);
    this.updateMusicFx(on ? 0.3 : 0.6);
  }

  private updateMusicFx(tau: number): void {
    const t = this.ctx.currentTime;
    const x = Math.max(0, Math.min(1, this.tone / 0.55));
    let cutoff = 6500 * (20000 / 6500) ** x;
    if (this.eveil) cutoff = 20000;
    if (this.rift) cutoff = 2200;
    if (this.endMode === 'victory') cutoff = 20000;
    if (this.endMode === 'defeat') cutoff = 900;
    if (this.paused) cutoff = 650;
    this.lowpass.frequency.setTargetAtTime(cutoff, t, tau);
    this.satWet.gain.setTargetAtTime(this.eveil ? 0.35 : 0, t, tau);
    this.satDry.gain.setTargetAtTime(this.eveil ? 0.8 : 1, t, tau);
    this.reverbWet.gain.setTargetAtTime(
      this.paused ? 0.3 : this.rift || this.endMode === 'defeat' ? 0.34 : 0.16 - 0.08 * x,
      t,
      tau,
    );
    this.musicIn.gain.setTargetAtTime(this.paused ? 0.55 : 1, t, tau);
  }

  /** Ducking de la musique : `db` négatif, attaque, maintien et relâche en secondes. */
  duck(db: number, attack = 0.03, hold = 0.25, release = 0.6): void {
    const p = this.duckGain.gain;
    const t = this.ctx.currentTime;
    const target = 10 ** (db / 20);
    const cur = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(cur, t);
    p.setTargetAtTime(Math.min(cur, target), t, attack / 3);
    p.setTargetAtTime(1, t + attack + hold, release / 3);
  }

  /** Temps audio courant (secondes). */
  get now(): number {
    return this.ctx.currentTime;
  }
}
