/**
 * Effets sonores : manifeste `assets/audio/sfx/sfx.json`, buffers décodés au chargement,
 * voix limitées par son et au total (vol de la voix la moins prioritaire puis la plus ancienne),
 * anti-rafale, variations de hauteur et de volume, panoramique selon la position à l'écran.
 * Mode casque : panoramique élargi + effet Haas (oreille opposée retardée) sur les côtés.
 */

export type BusName = 'sfx' | 'ui' | 'ambience';

export interface SoundDef {
  files: string[];
  bus: BusName;
  gainDb: number;
  /** Variation de hauteur relative (± ; 0.05 = ±5 %). */
  pitchVar: number;
  /** Variation de volume relative (±). */
  volVar: number;
  maxVoices: number;
  /** Plus grand = plus important. */
  priority: number;
  cooldownMs: number;
}

export interface SfxManifest {
  version: 1;
  sounds: Record<string, SoundDef>;
}

const FILES = import.meta.glob<string>('../../assets/audio/sfx/**/*.ogg', {
  query: '?url',
  import: 'default',
  eager: true,
});

export function sfxUrl(file: string): string | undefined {
  return FILES[`../../assets/audio/sfx/${file}`];
}

const MAX_VOICES = 28;
const HAAS_SECONDS = 0.00045;

interface Sound {
  def: SoundDef;
  buffers: AudioBuffer[];
  gain: number;
  last: number;
  lastVariant: number;
  voices: number;
}

/** Voix réutilisable : gain → panoramique restent câblés ; seule la source est recréée. */
class Voice {
  src: AudioBufferSourceNode | null = null;
  sound: Sound | null = null;
  start = 0;
  priority = 0;
  /** Comptée dans les voix actives (faux pendant le fondu d'une voix volée). */
  active = false;
  readonly onEnded: (e: Event) => void;

  constructor(
    readonly out: GainNode,
    readonly pan: StereoPannerNode,
    recycle: (v: Voice) => void,
  ) {
    out.connect(pan);
    this.onEnded = (e) => {
      if (e.target === this.src) recycle(this);
    };
  }
}

/** Bus stéréo de côté : l'oreille opposée est retardée (effet Haas) en mode casque. */
class SideBus {
  readonly input: GainNode;
  private readonly delay: DelayNode;

  constructor(ctx: AudioContext, dest: AudioNode, side: 0 | 1) {
    this.input = ctx.createGain();
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    this.delay = ctx.createDelay(0.01);
    this.delay.delayTime.value = 0;
    this.input.connect(split);
    // side 0 = gauche : l'oreille droite (1) est retardée.
    const far = side === 0 ? 1 : 0;
    const near = 1 - far;
    split.connect(merge, near, near);
    split.connect(this.delay, far);
    this.delay.connect(merge, 0, far);
    merge.connect(dest);
  }

  setHaas(on: boolean, t: number): void {
    this.delay.delayTime.setTargetAtTime(on ? HAAS_SECONDS : 0, t, 0.02);
  }
}

export class SfxEngine {
  private readonly sounds = new Map<string, Sound>();
  private readonly voices: Voice[] = [];
  private readonly free: Voice[] = [];
  private readonly sides = new Map<AudioNode, [SideBus, SideBus]>();
  private headphones = false;
  /** Générateur local (cosmétique) pour les variations. */
  private seed = 0x9e3779b9;

  constructor(
    private readonly ctx: AudioContext,
    private readonly buses: Record<BusName, AudioNode>,
  ) {
    for (const bus of Object.values(buses))
      this.sides.set(bus, [new SideBus(ctx, bus, 0), new SideBus(ctx, bus, 1)]);
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed ^ (this.seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return this.seed / 4294967296;
  }

  /** Charge et décode tous les sons du manifeste (fichiers absents ignorés). */
  async load(manifest: SfxManifest): Promise<void> {
    await Promise.all(
      Object.entries(manifest.sounds).map(async ([id, def]) => {
        const buffers: AudioBuffer[] = [];
        for (const f of def.files) {
          const url = sfxUrl(f);
          if (!url) continue;
          try {
            const data = await (await fetch(url)).arrayBuffer();
            buffers.push(await this.ctx.decodeAudioData(data));
          } catch (e) {
            console.warn(`Son illisible ${f} :`, e);
          }
        }
        if (buffers.length > 0) {
          this.sounds.set(id, {
            def,
            buffers,
            gain: 10 ** (def.gainDb / 20),
            last: -1e9,
            lastVariant: -1,
            voices: 0,
          });
        }
      }),
    );
  }

  has(id: string): boolean {
    return this.sounds.has(id);
  }

  setHeadphones(on: boolean): void {
    this.headphones = on;
    const t = this.ctx.currentTime;
    for (const [l, r] of this.sides.values()) {
      l.setHaas(on, t);
      r.setHaas(on, t);
    }
  }

  get activeVoices(): number {
    return this.voices.length;
  }

  private deactivate(v: Voice): void {
    if (!v.active) return;
    v.active = false;
    if (v.sound) v.sound.voices--;
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  private readonly recycle = (v: Voice): void => {
    this.deactivate(v);
    v.src?.disconnect();
    v.src = null;
    v.sound = null;
    v.pan.disconnect();
    this.free.push(v);
  };

  private steal(sound: Sound | null, priority: number): boolean {
    let victim: Voice | null = null;
    for (const v of this.voices) {
      if (sound && v.sound !== sound) continue;
      if (v.priority > priority) continue;
      if (
        !victim ||
        v.priority < victim.priority ||
        (v.priority === victim.priority && v.start < victim.start)
      )
        victim = v;
    }
    if (!victim) return false;
    // Fondu court puis arrêt : la voix revient au pool à la fin de sa source.
    const t = this.ctx.currentTime;
    victim.out.gain.setTargetAtTime(0, t, 0.008);
    try {
      victim.src?.stop(t + 0.04);
    } catch {
      /* déjà arrêtée */
    }
    this.deactivate(victim);
    return true;
  }

  /**
   * Joue un son ; faux s'il est inconnu, en anti-rafale ou sans voix disponible.
   * pan : -1 (gauche) … 1 (droite) ; gain linéaire et facteur de vitesse supplémentaires.
   */
  play(id: string, pan = 0, gain = 1, rate = 1): boolean {
    const s = this.sounds.get(id);
    if (!s) return false;
    const def = s.def;
    const now = this.ctx.currentTime;
    if ((now - s.last) * 1000 < def.cooldownMs) return false;
    if (s.voices >= def.maxVoices && !this.steal(s, Number.POSITIVE_INFINITY)) return false;
    if (this.voices.length >= MAX_VOICES && !this.steal(null, def.priority)) return false;
    s.last = now;
    // Variante tirée sans répéter la précédente.
    let k = 0;
    if (s.buffers.length > 1) {
      k = Math.floor(this.rand() * (s.buffers.length - 1));
      if (k >= s.lastVariant) k++;
    }
    s.lastVariant = k;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = s.buffers[k];
    src.playbackRate.value = rate * (1 + (this.rand() * 2 - 1) * def.pitchVar);
    const v =
      this.free.pop() ?? new Voice(ctx.createGain(), ctx.createStereoPanner(), this.recycle);
    const g = v.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(s.gain * gain * (1 + (this.rand() * 2 - 1) * def.volVar), now);
    const p = Math.max(-1, Math.min(1, pan));
    v.pan.pan.value = p * (this.headphones ? 1 : 0.6);
    const bus = this.buses[def.bus];
    const sides = this.sides.get(bus);
    v.pan.connect(sides && Math.abs(p) > 0.35 ? sides[p < 0 ? 0 : 1].input : bus);
    src.connect(v.out);
    src.onended = v.onEnded;
    v.src = src;
    v.sound = s;
    v.start = now;
    v.priority = def.priority;
    v.active = true;
    s.voices++;
    this.voices.push(v);
    src.start(now);
    return true;
  }

  stopAll(): void {
    for (const v of [...this.voices]) {
      try {
        v.src?.stop();
      } catch {
        /* déjà arrêtée */
      }
      this.deactivate(v);
    }
  }
}
