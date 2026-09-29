/**
 * Lecteur musical (thread principal) : pilote le worklet mixeur et le worker de décodage.
 * Ouvre des decks (stems joués en phase), les démarre sur la mesure d'un autre deck, programme
 * les rampes de gain et le varispeed, et suit les positions rapportées par le worklet.
 * Repli sans WebCodecs : décodage complet en mono 24 kHz Int16 sur le thread principal.
 */
import { MUSIC_RATE, barFrames, dbToGain, nextBar, type TrackDef } from './manifest';
import mixerUrl from './mixer.worklet.ts?worker&url';
import {
  PART_INTRO,
  PART_LOOP,
  type DeckSpec,
  type FromMixer,
  type FromWorker,
  type MixerReport,
  type ToMixer,
  type ToWorker,
} from './protocol';

const FILES = import.meta.glob<string>('../../../assets/audio/music/**/*.ogg', {
  query: '?url',
  import: 'default',
  eager: true,
});

export function musicUrl(file: string): string {
  const url = FILES[`../../../assets/audio/music/${file}`];
  if (!url) throw new Error(`Fichier musical absent : ${file}`);
  return url;
}

/** Deck ouvert : pistes jouées en phase (calme puis intense pour un stage). */
export interface OpenDeck {
  id: number;
  tracks: TrackDef[];
  /** Grille de référence (première piste). */
  grid: TrackDef;
  /** Palier d'entrée de chaque stem, dans l'ordre du deck. */
  enterAt: number[];
  /** Nombre de stems de la première piste. */
  calmCount: number;
  /** Gain de piste (gainDb) de chaque stem. */
  trim: number[];
  ready: Promise<void>;
  started: boolean;
}

const FALLBACK_RATE = 24000;

export class MusicPlayer {
  readonly node: AudioWorkletNode;
  private readonly worker: Worker | null;
  private readonly decks = new Map<number, OpenDeck>();
  private readonly waiting = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  private nextId = 1;
  /** Dernier rapport du worklet et instant de réception (secondes de contexte). */
  report: MixerReport | null = null;
  private reportTime = 0;
  onReport: ((r: MixerReport) => void) | null = null;

  private constructor(
    private readonly ctx: BaseAudioContext,
    node: AudioWorkletNode,
    readonly streaming: boolean,
  ) {
    this.node = node;
    node.port.onmessage = (e: MessageEvent<FromMixer>) => {
      const m = e.data;
      if (m.type === 'report') {
        this.report = m;
        this.reportTime = this.ctx.currentTime;
        this.onReport?.(m);
      } else this.forget(m.deck);
    };
    if (streaming) {
      this.worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        const w = this.waiting.get(m.deck);
        if (!w) return;
        this.waiting.delete(m.deck);
        if (m.type === 'ready') w.resolve();
        else w.reject(new Error(m.message));
      };
      const channel = new MessageChannel();
      this.worker.postMessage({ type: 'port', port: channel.port1 }, [channel.port1]);
      node.port.postMessage({ type: 'port', port: channel.port2 }, [channel.port2]);
    } else this.worker = null;
  }

  static async create(ctx: AudioContext): Promise<MusicPlayer> {
    await ctx.audioWorklet.addModule(mixerUrl);
    const node = new AudioWorkletNode(ctx, 'vp-music-mixer', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    let streaming = typeof AudioDecoder !== 'undefined' && typeof Worker !== 'undefined';
    if (streaming) {
      try {
        const s = await AudioDecoder.isConfigSupported({
          codec: 'opus',
          sampleRate: 48000,
          numberOfChannels: 2,
        });
        streaming = s.supported === true;
      } catch {
        streaming = false;
      }
    }
    return new MusicPlayer(ctx, node, streaming);
  }

  private send(msg: ToMixer, transfer: Transferable[] = []): void {
    this.node.port.postMessage(msg, transfer);
  }

  private toWorker(msg: ToWorker): void {
    this.worker?.postMessage(msg);
  }

  /** Échantillon de contexte courant. */
  get frameNow(): number {
    return this.ctx.currentTime * this.ctx.sampleRate;
  }

  /** Position estimée d'un deck maintenant (échantillons de piste), -1 s'il ne joue pas. */
  position(id: number): number {
    const r = this.report;
    const d = r?.decks.find((x) => x.id === id);
    if (!r || !d?.started) return -1;
    return d.pos + (this.ctx.currentTime - this.reportTime) * MUSIC_RATE * r.rate;
  }

  /** Ouvre un deck (décodage amorcé) ; il ne joue qu'après `start`. */
  open(tracks: TrackDef[], gains: ArrayLike<number>, deckGain = 0): OpenDeck {
    const id = this.nextId++;
    const grid = tracks[0];
    const loopStart = Math.round(grid.loopStart * MUSIC_RATE);
    const loopLength = Math.round((grid.loopEnd - grid.loopStart) * MUSIC_RATE);
    const stems = tracks.flatMap((t) => t.stems.map((s) => ({ track: t, stem: s })));
    const spec: DeckSpec = {
      id,
      loopStart,
      loopLength,
      layout: grid.layout,
      gain: deckGain,
      stems: stems.map(({ stem }) => ({
        intro: stem.intro ? musicUrl(stem.intro) : null,
        loop: musicUrl(stem.file),
      })),
      gains: stems.map(({ track }, i) => (gains[i] ?? 0) * dbToGain(track.gainDb)),
    };
    this.send({ type: 'deck', deck: spec });
    const ready = new Promise<void>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
    });
    if (this.streaming) this.toWorker({ type: 'open', deck: spec });
    else void this.decodeStatic(spec);
    const deck: OpenDeck = {
      id,
      tracks,
      grid,
      enterAt: stems.map(({ stem }) => stem.enterAt),
      calmCount: tracks[0].stems.length,
      trim: stems.map(({ track }) => dbToGain(track.gainDb)),
      ready,
      started: false,
    };
    this.decks.set(id, deck);
    return deck;
  }

  private async decodeStatic(spec: DeckSpec): Promise<void> {
    const w = this.waiting.get(spec.id);
    try {
      const decode = async (url: string): Promise<Float32Array> => {
        const buf = await (await fetch(url)).arrayBuffer();
        const off = new OfflineAudioContext(1, 1, FALLBACK_RATE);
        const audio = await off.decodeAudioData(buf);
        return audio.getChannelData(0);
      };
      const toInt16 = (f: Float32Array, a: number, b: number): Int16Array => {
        const out = new Int16Array(Math.max(0, b - a));
        for (let i = 0; i < out.length; i++)
          out[i] = Math.max(-32768, Math.min(32767, Math.round(f[a + i] * 32767)));
        return out;
      };
      const k = FALLBACK_RATE / MUSIC_RATE;
      for (let i = 0; i < spec.stems.length; i++) {
        const s = spec.stems[i];
        const whole = await decode(s.loop);
        if (spec.layout === 'split') {
          if (s.intro) {
            const intro = await decode(s.intro);
            const data = toInt16(intro, 0, intro.length);
            this.send(
              {
                type: 'static',
                deck: spec.id,
                stem: i,
                part: PART_INTRO,
                data,
                rate: FALLBACK_RATE,
                length: data.length,
              },
              [data.buffer],
            );
          }
          const data = toInt16(whole, 0, Math.min(whole.length, Math.round(spec.loopLength * k)));
          this.send(
            {
              type: 'static',
              deck: spec.id,
              stem: i,
              part: PART_LOOP,
              data,
              rate: FALLBACK_RATE,
              length: data.length,
            },
            [data.buffer],
          );
        } else {
          const a = Math.round(spec.loopStart * k);
          const b = Math.min(whole.length, Math.round((spec.loopStart + spec.loopLength) * k));
          const intro = toInt16(whole, 0, a);
          this.send(
            {
              type: 'static',
              deck: spec.id,
              stem: i,
              part: PART_INTRO,
              data: intro,
              rate: FALLBACK_RATE,
              length: intro.length,
            },
            [intro.buffer],
          );
          const loop = toInt16(whole, a, b);
          this.send(
            {
              type: 'static',
              deck: spec.id,
              stem: i,
              part: PART_LOOP,
              data: loop,
              rate: FALLBACK_RATE,
              length: loop.length,
            },
            [loop.buffer],
          );
        }
      }
      this.waiting.delete(spec.id);
      w?.resolve();
    } catch (e) {
      this.waiting.delete(spec.id);
      w?.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Démarre un deck. Avec `after`, au début de la mesure suivante de ce deck (≥ marge),
   * sinon tout de suite. Renvoie l'échantillon de contexte de démarrage.
   */
  start(deck: OpenDeck, after: OpenDeck | null, marginSec = 0.12): number {
    let at = this.frameNow + 0.05 * this.ctx.sampleRate;
    if (after?.started) {
      const pos = this.position(after.id);
      if (pos >= 0) {
        const rate = this.report?.rate ?? 1;
        const bar = nextBar(after.grid, pos, marginSec * MUSIC_RATE * rate);
        at = this.frameNow + (bar - pos) / rate;
      }
    }
    deck.started = true;
    this.send({ type: 'start', deck: deck.id, at });
    return at;
  }

  /** Rampe de gain d'un stem (-1 : deck) à la position de piste `at` (-1 : maintenant). */
  ramp(deck: OpenDeck, stem: number, target: number, at: number, seconds: number): void {
    const t = stem >= 0 ? target * (deck.trim[stem] ?? 1) : target;
    this.send({
      type: 'ramp',
      deck: deck.id,
      stem,
      target: t,
      at,
      frames: Math.round(seconds * MUSIC_RATE),
    });
  }

  /** Prochaine barre de mesure du deck (position de piste), ou -1 s'il ne joue pas. */
  nextBar(deck: OpenDeck, marginSec = 0.12): number {
    const pos = this.position(deck.id);
    if (pos < 0) return -1;
    return nextBar(deck.grid, pos, marginSec * MUSIC_RATE * (this.report?.rate ?? 1));
  }

  barSeconds(deck: OpenDeck): number {
    return barFrames(deck.grid) / MUSIC_RATE;
  }

  setRate(rate: number, seconds: number): void {
    this.send({ type: 'rate', rate, frames: Math.round(seconds * MUSIC_RATE) });
  }

  /** Retire un deck dans `seconds` secondes. */
  stop(deck: OpenDeck, seconds: number): void {
    this.send({ type: 'stop', deck: deck.id, at: this.frameNow + seconds * this.ctx.sampleRate });
  }

  private forget(id: number): void {
    this.decks.delete(id);
    this.toWorker({ type: 'close', deck: id });
  }

  dispose(): void {
    for (const id of this.decks.keys()) this.forget(id);
    this.worker?.terminate();
    this.node.disconnect();
  }
}
