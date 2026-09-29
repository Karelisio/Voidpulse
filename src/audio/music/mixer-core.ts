/**
 * Cœur du mixeur musical (exécuté dans l'AudioWorklet, testé sous Node) : decks de stems lus
 * en phase à l'échantillon près, flux PCM reçus par blocs (ou décodés en entier en repli),
 * rampes de gain calées sur la position de piste, varispeed commun. Aucune allocation par bloc
 * rendu hors réception de messages.
 */
import { MUSIC_RATE } from './manifest';
import {
  PART_INTRO,
  type DeckReport,
  type DeckSpec,
  type MixerReport,
  type StreamPart,
} from './protocol';

export const QUANTUM = 128;

/** Flux d'un stem (intro ou boucle), indexé en échantillons à 48 kHz depuis son début. */
export class Stream {
  private blocks: Float32Array[] = [];
  private starts: number[] = [];
  private cursor = 0;
  /** Fin du flux (échantillons), Infinity tant qu'elle n'est pas connue. */
  endIndex = Infinity;
  /** Index du premier échantillon absent (fin des données reçues). */
  available = 0;
  underruns = 0;
  // Repli : PCM mono Int16 complet.
  private pcm: Int16Array | null = null;
  private scale = 1;
  private periodic = false;
  private l = 0;
  private r = 0;

  push(start: number, data: Float32Array, end: boolean): void {
    if (start !== this.available && this.blocks.length > 0) {
      // Discontinuité (ne devrait pas arriver) : on repart de ce bloc.
      this.blocks.length = 0;
      this.starts.length = 0;
      this.cursor = 0;
    }
    this.blocks.push(data);
    this.starts.push(start);
    this.available = start + data.length / 2;
    if (end) this.endIndex = this.available;
  }

  setStatic(data: Int16Array, rate: number, length: number, periodic: boolean): void {
    this.pcm = data;
    this.scale = rate / MUSIC_RATE;
    this.periodic = periodic;
    this.endIndex = periodic ? Infinity : length / this.scale;
    this.available = Infinity;
  }

  /** Libère les blocs entièrement antérieurs à `index`. */
  trim(index: number): void {
    let drop = 0;
    while (
      drop < this.blocks.length - 1 &&
      this.starts[drop] + this.blocks[drop].length / 2 <= index
    )
      drop++;
    if (drop > 0) {
      this.blocks.splice(0, drop);
      this.starts.splice(0, drop);
      this.cursor = Math.max(0, this.cursor - drop);
    }
  }

  /** Charge l'échantillon entier `i` dans (l, r) ; faux s'il manque. */
  private fetch(i: number): boolean {
    if (i < 0 || i >= this.endIndex) {
      this.l = 0;
      this.r = 0;
      return true;
    }
    const pcm = this.pcm;
    if (pcm) {
      const len = pcm.length;
      let j = i * this.scale;
      if (this.periodic) j %= len;
      const k = Math.floor(j);
      const f = j - k;
      const k1 = k + 1 < len ? k + 1 : this.periodic ? 0 : k;
      const v = (pcm[k] + (pcm[k1] - pcm[k]) * f) / 32768;
      this.l = v;
      this.r = v;
      return true;
    }
    if (i >= this.available) return false;
    const starts = this.starts;
    let c = this.cursor;
    if (c >= starts.length || starts[c] > i) c = 0;
    while (c < starts.length && starts[c] + this.blocks[c].length / 2 <= i) c++;
    if (c >= starts.length || starts[c] > i) return false;
    this.cursor = c;
    const o = (i - starts[c]) * 2;
    const b = this.blocks[c];
    this.l = b[o];
    this.r = b[o + 1];
    return true;
  }

  /**
   * Ajoute à la sortie `n` échantillons lus aux positions base + offs[i] (fractionnaires),
   * pondérés par gains[i]. Renvoie la somme des carrés (mesure de niveau).
   */
  mix(
    outL: Float32Array,
    outR: Float32Array,
    base: number,
    offs: Float32Array,
    gains: Float32Array,
    n: number,
  ): number {
    let sq = 0;
    let missing = false;
    for (let i = 0; i < n; i++) {
      const g = gains[i];
      if (g === 0) continue;
      const x = base + offs[i];
      const k = Math.floor(x);
      const f = x - k;
      if (this.pcm) {
        if (!this.fetch(x)) continue;
        const vl = this.l * g;
        const vr = this.r * g;
        outL[i] += vl;
        outR[i] += vr;
        sq += vl * vl + vr * vr;
        continue;
      }
      if (!this.fetch(k)) {
        missing = true;
        continue;
      }
      let l = this.l;
      let r = this.r;
      if (f > 1e-6) {
        if (this.fetch(k + 1)) {
          l += (this.l - l) * f;
          r += (this.r - r) * f;
        }
      }
      const vl = l * g;
      const vr = r * g;
      outL[i] += vl;
      outR[i] += vr;
      sq += vl * vl + vr * vr;
    }
    if (missing) this.underruns++;
    return sq;
  }
}

interface Ramp {
  at: number;
  target: number;
  frames: number;
}

/** Gain avec rampes linéaires programmées sur la position de piste. */
export class RampedGain {
  value: number;
  private target: number;
  private step = 0;
  private remaining = 0;
  private pending: Ramp[] = [];

  constructor(value: number) {
    this.value = value;
    this.target = value;
  }

  get destination(): number {
    return this.pending.length > 0 ? this.pending[this.pending.length - 1].target : this.target;
  }

  /** Programme une rampe ; `at` < 0 : immédiate. Les rampes plus tardives sont remplacées. */
  schedule(target: number, at: number, frames: number, now: number): void {
    const start = at < 0 ? now : at;
    this.pending = this.pending.filter((r) => r.at < start);
    this.pending.push({ at: start, target, frames: Math.max(1, frames) });
  }

  /** Remplit `out` avec le gain de chaque échantillon (positions base + offs[i]). */
  render(out: Float32Array, base: number, offs: Float32Array, n: number): boolean {
    let silent = this.value === 0 && this.remaining === 0 && this.pending.length === 0;
    if (silent) {
      out.fill(0, 0, n);
      return true;
    }
    silent = true;
    for (let i = 0; i < n; i++) {
      if (this.pending.length > 0 && base + offs[i] >= this.pending[0].at) {
        const r = this.pending.shift()!;
        this.target = r.target;
        this.remaining = r.frames;
        this.step = (r.target - this.value) / r.frames;
      }
      if (this.remaining > 0) {
        this.value += this.step;
        if (--this.remaining === 0) this.value = this.target;
      }
      out[i] = this.value;
      if (this.value !== 0) silent = false;
    }
    return silent;
  }
}

interface StemState {
  intro: Stream | null;
  loop: Stream;
  gain: RampedGain;
  sq: number;
}

export class Deck {
  pos = 0;
  started = false;
  startAt = 0;
  stopAt = -1;
  readonly gain: RampedGain;
  readonly stems: StemState[];

  constructor(readonly spec: DeckSpec) {
    this.gain = new RampedGain(spec.gain);
    this.stems = spec.stems.map((s, i) => ({
      intro: s.intro !== null || spec.layout === 'single' ? new Stream() : null,
      loop: new Stream(),
      gain: new RampedGain(spec.gains[i] ?? 0),
      sq: 0,
    }));
  }

  stream(stem: number, part: StreamPart): Stream | null {
    const s = this.stems[stem] as StemState | undefined;
    if (!s) return null;
    return part === PART_INTRO ? s.intro : s.loop;
  }
}

/** Mixeur complet : decks, varispeed, rapports. */
export class MixerCore {
  readonly decks = new Map<number, Deck>();
  /** Échantillon de contexte au début du prochain bloc. */
  frame = 0;
  rate = 1;
  private rateTarget = 1;
  private rateStep = 0;
  private rateRemaining = 0;
  private readonly offs = new Float32Array(QUANTUM);
  private readonly stemGain = new Float32Array(QUANTUM);
  private readonly deckGain = new Float32Array(QUANTUM);
  private readonly bufL = new Float32Array(QUANTUM);
  private readonly bufR = new Float32Array(QUANTUM);
  private windowFrames = 0;
  underruns = 0;

  addDeck(spec: DeckSpec): Deck {
    const d = new Deck(spec);
    this.decks.set(spec.id, d);
    return d;
  }

  start(id: number, at: number): void {
    const d = this.decks.get(id);
    if (!d) return;
    d.started = false;
    d.startAt = at;
  }

  stop(id: number, at: number): void {
    const d = this.decks.get(id);
    if (d) d.stopAt = at;
  }

  ramp(id: number, stem: number, target: number, at: number, frames: number): void {
    const d = this.decks.get(id);
    if (!d) return;
    const g = stem < 0 ? d.gain : (d.stems[stem] as StemState | undefined)?.gain;
    g?.schedule(target, at, frames, d.pos);
  }

  setRate(rate: number, frames: number): void {
    this.rateTarget = rate;
    this.rateRemaining = Math.max(1, frames);
    this.rateStep = (rate - this.rate) / this.rateRemaining;
  }

  /**
   * Rend un bloc de `n` échantillons (≤ QUANTUM) dans outL/outR (écrasés).
   * Renvoie les identifiants des decks terminés pendant ce bloc.
   */
  process(outL: Float32Array, outR: Float32Array, n: number, ended: number[]): void {
    outL.fill(0, 0, n);
    outR.fill(0, 0, n);
    // Positions relatives (varispeed commun) : offs[i] = avance cumulée avant l'échantillon i.
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this.offs[i] = acc;
      if (this.rateRemaining > 0) {
        this.rate += this.rateStep;
        if (--this.rateRemaining === 0) this.rate = this.rateTarget;
      }
      acc += this.rate;
    }
    const blockEnd = this.frame + n;
    for (const d of this.decks.values()) {
      if (d.stopAt >= 0 && d.stopAt < blockEnd) {
        this.decks.delete(d.spec.id);
        ended.push(d.spec.id);
        continue;
      }
      if (!d.started) {
        if (d.startAt >= blockEnd) continue;
        d.started = true;
      }
      const silentDeck = d.gain.render(this.deckGain, d.pos, this.offs, n);
      if (!silentDeck) {
        this.bufL.fill(0, 0, n);
        this.bufR.fill(0, 0, n);
        const loopStart = d.spec.loopStart;
        for (const s of d.stems) {
          if (s.gain.render(this.stemGain, d.pos, this.offs, n)) continue;
          let sq = 0;
          if (s.intro) sq += s.intro.mix(this.bufL, this.bufR, d.pos, this.offs, this.stemGain, n);
          if (d.pos + acc > loopStart)
            sq += s.loop.mix(this.bufL, this.bufR, d.pos - loopStart, this.offs, this.stemGain, n);
          s.sq += sq;
        }
        for (let i = 0; i < n; i++) {
          const g = this.deckGain[i];
          outL[i] += this.bufL[i] * g;
          outR[i] += this.bufR[i] * g;
        }
      } else {
        // Deck muet : les rampes de stems avancent quand même.
        for (const s of d.stems) s.gain.render(this.stemGain, d.pos, this.offs, n);
      }
      d.pos += acc;
      if (this.rateRemaining === 0 && this.rate === 1) d.pos = Math.round(d.pos);
      for (const s of d.stems) {
        s.intro?.trim(Math.floor(d.pos) - 2);
        s.loop.trim(Math.floor(d.pos - d.spec.loopStart) - 2);
      }
    }
    this.frame = blockEnd;
    this.windowFrames += n;
  }

  /** Rapport d'état ; remet à zéro les mesures de niveau. */
  report(): MixerReport {
    const decks: DeckReport[] = [];
    let underruns = 0;
    const w = Math.max(1, this.windowFrames * 2);
    for (const d of this.decks.values()) {
      decks.push({
        id: d.spec.id,
        started: d.started,
        pos: d.pos,
        gain: d.gain.value,
        stemGains: d.stems.map((s) => s.gain.value),
        levels: d.stems.map((s) => Math.sqrt(s.sq / w)),
      });
      for (const s of d.stems) {
        s.sq = 0;
        underruns += s.loop.underruns + (s.intro?.underruns ?? 0);
      }
    }
    this.windowFrames = 0;
    this.underruns = underruns;
    return { type: 'report', frame: this.frame, rate: this.rate, underruns, decks };
  }
}
