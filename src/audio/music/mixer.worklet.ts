/**
 * AudioWorklet mixeur musical : enveloppe de MixerCore. Reçoit les commandes du thread
 * principal (port du nœud) et le PCM du worker de décodage (canal direct), envoie des rapports
 * de position/niveaux au principal et la position de lecture au worker.
 */
import { MixerCore, QUANTUM } from './mixer-core';
import type { Consumed, FromMixer, PcmBlock, ToMixer } from './protocol';

// Portée globale des AudioWorklets (non typée par la lib DOM).
declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

const REPORT_EVERY = 16;
const CONSUMED_EVERY = 6;

class MusicMixer extends AudioWorkletProcessor {
  private readonly core = new MixerCore();
  private worker: MessagePort | null = null;
  private blocks = 0;
  private readonly ended: number[] = [];

  constructor() {
    super();
    this.core.frame = currentFrame;
    this.port.onmessage = (e: MessageEvent<ToMixer | { type: 'port'; port: MessagePort }>) => {
      this.command(e.data);
    };
  }

  private command(msg: ToMixer | { type: 'port'; port: MessagePort }): void {
    const core = this.core;
    switch (msg.type) {
      case 'port':
        this.worker = msg.port;
        this.worker.onmessage = (e: MessageEvent<PcmBlock>) => {
          const b = e.data;
          core.decks.get(b.deck)?.stream(b.stem, b.part)?.push(b.start, b.data, b.end);
        };
        break;
      case 'deck':
        core.addDeck(msg.deck);
        break;
      case 'static': {
        const d = core.decks.get(msg.deck);
        d?.stream(msg.stem, msg.part)?.setStatic(msg.data, msg.rate, msg.length, msg.part === 1);
        break;
      }
      case 'start':
        core.start(msg.deck, msg.at);
        break;
      case 'ramp':
        core.ramp(msg.deck, msg.stem, msg.target, msg.at, msg.frames);
        break;
      case 'rate':
        core.setRate(msg.rate, msg.frames);
        break;
      case 'stop':
        core.stop(msg.deck, msg.at);
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const l = out[0];
    const r = out.length > 1 ? out[1] : out[0];
    const n = Math.min(l.length, QUANTUM);
    const core = this.core;
    core.frame = currentFrame;
    this.ended.length = 0;
    core.process(l, r, n, this.ended);
    for (const id of this.ended)
      this.port.postMessage({ type: 'ended', deck: id } satisfies FromMixer);
    this.blocks++;
    if (this.worker && this.blocks % CONSUMED_EVERY === 0) {
      for (const d of core.decks.values()) {
        if (d.started)
          this.worker.postMessage({ type: 'pos', deck: d.spec.id, pos: d.pos } satisfies Consumed);
      }
    }
    if (this.blocks % REPORT_EVERY === 0) this.port.postMessage(core.report());
    return true;
  }
}

registerProcessor('vp-music-mixer', MusicMixer);
