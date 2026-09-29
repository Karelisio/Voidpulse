/**
 * Worker de décodage musical : télécharge les fichiers Ogg Opus (gardés compressés en
 * mémoire), les décode en continu avec WebCodecs `AudioDecoder` juste en avance sur la
 * lecture, et pousse le PCM au worklet mixeur par un canal direct. Les boucles sont
 * redécodées à chaque tour (décodeur réinitialisé : jointure exacte à l'échantillon).
 */
/// <reference lib="webworker" />
import { demuxOggOpus, type OpusStream } from './ogg';
import {
  PART_INTRO,
  PART_LOOP,
  type Consumed,
  type DeckSpec,
  type FromWorker,
  type PcmBlock,
  type StreamPart,
  type ToWorker,
} from './protocol';

declare const self: DedicatedWorkerGlobalScope;

/** Avance visée sur la lecture (échantillons). */
const AHEAD = 48000 * 1.5;
/** Avance minimale avant de déclarer un deck prêt. */
const PRIME = 48000 * 0.6;
/** Taille des blocs envoyés au worklet. */
const BLOCK = 4800;
/** Pré-roll de décodage avant un point d'entrée en milieu de fichier (RFC 7845 : 80 ms). */
const PREROLL = 3840;

const files = new Map<string, Promise<OpusStream>>();
let mixerPort: MessagePort | null = null;

function load(url: string): Promise<OpusStream> {
  let p = files.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => demuxOggOpus(new Uint8Array(b)));
    files.set(url, p);
  }
  return p;
}

/** Flux décodé : plage [from, to) du fichier, jouée une fois ou en boucle. */
class DecodeStream {
  produced = 0;
  consumed = 0;
  done = false;
  private decoder: AudioDecoder | null = null;
  private cursor = 0;
  /** Index (fichier, après pré-skip) du prochain échantillon sorti par le décodeur. */
  private fileIndex = 0;
  private inFlight = 0;
  private draining = false;
  private acc = new Float32Array(BLOCK * 2);
  private accFrames = 0;
  private closed = false;
  private startPacket = 0;
  private startIndex = 0;
  /** Horodatage des paquets (échantillons décodés depuis la création). */
  private tsSamples = 0;

  constructor(
    readonly deck: number,
    readonly stem: number,
    readonly part: StreamPart,
    private readonly file: OpusStream,
    private readonly from: number,
    private readonly to: number,
    private readonly periodic: boolean,
    private readonly onProgress: () => void,
  ) {
    // Paquet de départ : assez tôt pour le pré-roll du décodeur.
    const pre = file.head.preSkip;
    let cum = 0;
    for (let i = 0; i < file.packets.length; i++) {
      if (cum - pre > from - PREROLL) break;
      this.startPacket = i;
      this.startIndex = cum - pre;
      cum += file.durations[i];
    }
    if (from - PREROLL <= -pre) {
      this.startPacket = 0;
      this.startIndex = -pre;
    }
    this.restart();
  }

  private restart(): void {
    this.decoder?.close();
    this.decoder = new AudioDecoder({
      output: (d) => {
        this.onData(d);
      },
      error: (e) => {
        console.warn('Décodage musical :', e.message);
        this.done = true;
      },
    });
    this.decoder.configure({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: this.file.head.channels,
    });
    this.cursor = this.startPacket;
    this.fileIndex = this.startIndex;
  }

  get ahead(): number {
    return this.produced - this.consumed;
  }

  pump(): void {
    const dec = this.decoder;
    if (this.closed || this.done || this.draining || !dec) return;
    const f = this.file;
    let pending = this.produced + this.accFrames + this.inFlight;
    while (pending - this.consumed < AHEAD && this.cursor < f.packets.length) {
      const d = f.durations[this.cursor];
      dec.decode(
        new EncodedAudioChunk({
          type: 'key',
          timestamp: Math.round(this.tsSamples / 0.048),
          data: f.packets[this.cursor],
        }),
      );
      this.tsSamples += d;
      this.cursor++;
      this.inFlight += d;
      pending += d;
    }
    if (this.cursor >= f.packets.length) {
      this.draining = true;
      void dec.flush().then(
        () => {
          this.draining = false;
          if (this.closed) return;
          this.inFlight = 0;
          if (this.periodic) {
            this.restart();
            this.pump();
          } else this.finish();
        },
        () => undefined,
      );
    }
  }

  private onData(d: AudioData): void {
    const n = d.numberOfFrames;
    this.inFlight = Math.max(0, this.inFlight - n);
    if (this.closed) {
      d.close();
      return;
    }
    const ch = d.numberOfChannels;
    const l = new Float32Array(n);
    d.copyTo(l, { planeIndex: 0, format: 'f32-planar' });
    let r = l;
    if (ch > 1) {
      r = new Float32Array(n);
      d.copyTo(r, { planeIndex: 1, format: 'f32-planar' });
    }
    d.close();
    const base = this.fileIndex;
    this.fileIndex += n;
    // Garde [from, to).
    const a = Math.max(0, this.from - base);
    const b = Math.min(n, this.to - base);
    for (let i = a; i < b; i++) {
      const o = this.accFrames * 2;
      this.acc[o] = l[i];
      this.acc[o + 1] = r[i];
      if (++this.accFrames === BLOCK) this.flushBlock(false);
    }
    if (this.fileIndex >= this.to && this.periodic && !this.draining) {
      // Fin de la plage bouclée atteinte avant la fin du fichier : on repart.
      this.cursor = this.file.packets.length;
    }
    this.onProgress();
  }

  private flushBlock(end: boolean): void {
    if (!mixerPort || (this.accFrames === 0 && !end)) return;
    const data = this.acc.slice(0, this.accFrames * 2);
    const msg: PcmBlock = {
      type: 'pcm',
      deck: this.deck,
      stem: this.stem,
      part: this.part,
      start: this.produced,
      data,
      end,
    };
    mixerPort.postMessage(msg, [data.buffer]);
    this.produced += this.accFrames;
    this.accFrames = 0;
  }

  private finish(): void {
    this.flushBlock(true);
    this.done = true;
  }

  close(): void {
    this.closed = true;
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.decoder = null;
  }
}

interface DeckStreams {
  spec: DeckSpec;
  streams: DecodeStream[];
  ready: boolean;
}

const decks = new Map<number, DeckStreams>();

function post(msg: FromWorker): void {
  self.postMessage(msg);
}

function checkReady(ds: DeckStreams): void {
  if (ds.ready) return;
  if (ds.streams.every((s) => s.done || s.produced >= PRIME)) {
    ds.ready = true;
    post({ type: 'ready', deck: ds.spec.id });
  }
}

async function open(spec: DeckSpec): Promise<void> {
  const ds: DeckStreams = { spec, streams: [], ready: false };
  decks.set(spec.id, ds);
  try {
    const loaded = await Promise.all(
      spec.stems.map(async (s) => ({
        intro: s.intro ? await load(s.intro) : null,
        loop: await load(s.loop),
      })),
    );
    if (decks.get(spec.id) !== ds) return;
    const progress = (): void => {
      checkReady(ds);
    };
    loaded.forEach((f, i) => {
      if (spec.layout === 'split') {
        if (f.intro)
          ds.streams.push(
            new DecodeStream(spec.id, i, PART_INTRO, f.intro, 0, f.intro.length, false, progress),
          );
        ds.streams.push(
          new DecodeStream(spec.id, i, PART_LOOP, f.loop, 0, f.loop.length, true, progress),
        );
      } else {
        const end = spec.loopStart + spec.loopLength;
        if (spec.loopStart > 0)
          ds.streams.push(
            new DecodeStream(spec.id, i, PART_INTRO, f.loop, 0, spec.loopStart, false, progress),
          );
        ds.streams.push(
          new DecodeStream(
            spec.id,
            i,
            PART_LOOP,
            f.loop,
            spec.loopStart,
            Math.min(end, f.loop.length),
            true,
            progress,
          ),
        );
      }
    });
    for (const s of ds.streams) s.pump();
  } catch (e) {
    post({ type: 'error', deck: spec.id, message: e instanceof Error ? e.message : String(e) });
  }
}

function close(id: number): void {
  const ds = decks.get(id);
  if (!ds) return;
  for (const s of ds.streams) s.close();
  decks.delete(id);
}

function onConsumed(msg: Consumed): void {
  const ds = decks.get(msg.deck);
  if (!ds) return;
  const loopPos = msg.pos - ds.spec.loopStart;
  for (const s of ds.streams) {
    s.consumed = Math.max(0, s.part === PART_INTRO ? msg.pos : loopPos);
    s.pump();
  }
}

self.onmessage = (e: MessageEvent<ToWorker | { type: 'port'; port: MessagePort }>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'port':
      mixerPort = msg.port;
      mixerPort.onmessage = (ev: MessageEvent<Consumed>) => {
        onConsumed(ev.data);
      };
      break;
    case 'open':
      void open(msg.deck);
      break;
    case 'close':
      close(msg.deck);
      break;
  }
};
