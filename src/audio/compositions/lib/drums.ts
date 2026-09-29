import * as Tone from 'tone';
import { chain, reverb, softClip, triggeredGate } from './fx';
import { inWindow } from './section';

export interface DrumKitOptions {
  /** Niveaux relatifs (dB) de chaque élément. */
  levels?: Partial<Record<DrumVoice, number>>;
  /** Hauteur (Hz) d'arrivée du kick. */
  kickPitch?: number;
  /** Durée de décroissance du kick (s). */
  kickDecay?: number;
  /** Saturation du bus (0 = aucune). */
  drive?: number;
  /** Réverb « gated » sur la caisse claire : durée d'ouverture (s), 0 = désactivée. */
  gatedHold?: number;
  /** Temps des caisses claires (pour piloter la porte de la réverb gated). */
  snareTimes?: readonly number[];
  roomDecay?: number;
  roomWet?: number;
  /** Gain (dB) avant l'écrêtage doux du bus : plus haut = transitoires plus contenues. */
  clipDrive?: number;
}

export type DrumVoice =
  'kick' | 'snare' | 'clap' | 'hat' | 'openHat' | 'shaker' | 'rim' | 'tom' | 'crash';

const DEFAULT_LEVELS: Record<DrumVoice, number> = {
  kick: -2,
  snare: -8,
  clap: -12,
  hat: -22,
  openHat: -23,
  shaker: -26,
  rim: -16,
  tom: -8,
  crash: -20,
};

/**
 * Batterie entièrement synthétisée (aucun échantillon). Cymbales et charleys en bruit filtré
 * (façon boîtes à rythmes analogiques), bus compressé puis écrêté en douceur pour contenir
 * le facteur de crête du mix.
 */
export class DrumKit {
  private readonly kickBody: Tone.MembraneSynth;
  private readonly kickClick: Tone.NoiseSynth;
  private readonly snareNoise: Tone.NoiseSynth;
  private readonly snareBody: Tone.Synth;
  private readonly clapNoise: Tone.NoiseSynth;
  private readonly hatNoise: Tone.NoiseSynth;
  private readonly openHatNoise: Tone.NoiseSynth;
  private readonly shakerNoise: Tone.NoiseSynth;
  private readonly rimSynth: Tone.Synth;
  private readonly tomSynth: Tone.MembraneSynth;
  private readonly crashNoise: Tone.NoiseSynth;
  private readonly kickPitch: number;

  private constructor(
    opts: DrumKitOptions,
    master: Tone.ToneAudioNode,
    room: Tone.Reverb,
    gatedSend: Tone.ToneAudioNode | null,
  ) {
    const lv = { ...DEFAULT_LEVELS, ...opts.levels };
    this.kickPitch = opts.kickPitch ?? 52;

    const bus = new Tone.Gain(1);
    const comp = new Tone.Compressor({
      threshold: -14,
      ratio: 3.5,
      attack: 0.006,
      release: 0.12,
      knee: 6,
    });
    if (opts.drive) {
      const drive = new Tone.Distortion({ distortion: opts.drive, oversample: '2x', wet: 0.35 });
      chain(bus, comp, drive, master);
    } else {
      chain(bus, comp, master);
    }

    const roomSend = new Tone.Gain(1);
    roomSend.connect(room);
    room.connect(bus);

    this.kickBody = new Tone.MembraneSynth({
      pitchDecay: 0.045,
      octaves: 5.5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: opts.kickDecay ?? 0.42, sustain: 0, release: 0.1 },
    });
    this.kickBody.volume.value = lv.kick;
    this.kickClick = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.0005, decay: 0.012, sustain: 0, release: 0.01 },
    });
    this.kickClick.volume.value = lv.kick - 16;
    this.kickBody.connect(bus);
    chain(this.kickClick, new Tone.Filter({ type: 'highpass', frequency: 2500 }), bus);

    this.snareNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.19, sustain: 0, release: 0.08 },
    });
    this.snareNoise.volume.value = lv.snare;
    this.snareBody = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.05 },
    });
    this.snareBody.volume.value = lv.snare - 1;
    const snareOut = new Tone.Gain(1);
    chain(
      this.snareNoise,
      new Tone.Filter({ type: 'highpass', frequency: 900 }),
      new Tone.Filter({ type: 'lowpass', frequency: 9000 }),
      snareOut,
    );
    this.snareBody.connect(snareOut);
    snareOut.connect(bus);
    snareOut.connect(roomSend);
    if (gatedSend) snareOut.connect(gatedSend);

    this.clapNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.05 },
    });
    this.clapNoise.volume.value = lv.clap;
    const clapBp = new Tone.Filter({ type: 'bandpass', frequency: 1300, Q: 0.9 });
    chain(this.clapNoise, clapBp, bus);
    clapBp.connect(roomSend);

    // Charleys : bruit blanc passe-haut + pic de brillance (métal).
    const hatTone = (): Tone.ToneAudioNode[] => [
      new Tone.Filter({ type: 'highpass', frequency: 7000, rolloff: -24 }),
      new Tone.Filter({ type: 'peaking', frequency: 10500, Q: 1.8, gain: 7 }),
    ];
    this.hatNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.02 },
    });
    this.hatNoise.volume.value = lv.hat;
    this.openHatNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.12 },
    });
    this.openHatNoise.volume.value = lv.openHat;
    const hatPan = new Tone.Panner(0.22);
    chain(this.hatNoise, ...hatTone(), hatPan);
    chain(this.openHatNoise, ...hatTone(), hatPan);
    hatPan.connect(bus);

    this.shakerNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.006, decay: 0.045, sustain: 0, release: 0.02 },
    });
    this.shakerNoise.volume.value = lv.shaker;
    chain(
      this.shakerNoise,
      new Tone.Filter({ type: 'bandpass', frequency: 7000, Q: 1.1 }),
      new Tone.Panner(-0.28),
      bus,
    );

    this.rimSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.0005, decay: 0.028, sustain: 0, release: 0.01 },
    });
    this.rimSynth.volume.value = lv.rim;
    const rimBp = new Tone.Filter({ type: 'bandpass', frequency: 1800, Q: 2 });
    chain(this.rimSynth, rimBp, bus);
    rimBp.connect(roomSend);

    this.tomSynth = new Tone.MembraneSynth({
      pitchDecay: 0.09,
      octaves: 2.2,
      envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.1 },
    });
    this.tomSynth.volume.value = lv.tom;
    this.tomSynth.connect(bus);
    this.tomSynth.connect(roomSend);

    // Crash : bruit à longue décroissance, filtré haut avec un léger pic métallique.
    this.crashNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 0.9 },
    });
    this.crashNoise.volume.value = lv.crash;
    const crashOut = new Tone.Gain(1);
    chain(
      this.crashNoise,
      new Tone.Filter({ type: 'highpass', frequency: 4200, rolloff: -12 }),
      new Tone.Filter({ type: 'peaking', frequency: 6800, Q: 2.5, gain: 6 }),
      crashOut,
    );
    crashOut.connect(bus);
    crashOut.connect(roomSend);
  }

  static async create(out: Tone.ToneAudioNode, opts: DrumKitOptions = {}): Promise<DrumKit> {
    const room = await reverb(opts.roomDecay ?? 1.4, opts.roomWet ?? 0.18);
    // Sortie commune : écrêtage doux puis limiteur, pour toute la batterie (réverb gated comprise).
    const master = new Tone.Gain(1);
    chain(
      master,
      new Tone.Gain(10 ** ((opts.clipDrive ?? 4) / 20)),
      softClip(0.5),
      new Tone.Limiter(-2),
      out,
    );
    let gatedSend: Tone.ToneAudioNode | null = null;
    if (opts.gatedHold && opts.snareTimes && opts.snareTimes.length > 0) {
      const big = await reverb(2.2, 1);
      const gate = triggeredGate(opts.snareTimes.filter(inWindow), opts.gatedHold, 0.035);
      gatedSend = new Tone.Gain(1);
      chain(gatedSend, big, gate, new Tone.Gain(0.55), master);
    }
    return new DrumKit(opts, master, room, gatedSend);
  }

  kick(t: number, vel = 1): void {
    if (!inWindow(t)) return;
    this.kickBody.triggerAttackRelease(this.kickPitch, 0.3, t, vel);
    this.kickClick.triggerAttackRelease(0.01, t, vel);
  }

  snare(t: number, vel = 1): void {
    if (!inWindow(t)) return;
    this.snareNoise.triggerAttackRelease(0.12, t, vel);
    this.snareBody.triggerAttackRelease(190, 0.06, t, vel);
  }

  clap(t: number, vel = 1): void {
    if (!inWindow(t)) return;
    // Trois impulsions rapprochées puis une queue : la signature d'un clap.
    this.clapNoise.triggerAttackRelease(0.008, t, vel * 0.8);
    this.clapNoise.triggerAttackRelease(0.008, t + 0.011, vel * 0.85);
    this.clapNoise.triggerAttackRelease(0.06, t + 0.022, vel);
  }

  hat(t: number, vel = 0.8): void {
    if (!inWindow(t)) return;
    this.hatNoise.triggerAttackRelease(0.03, t, vel);
  }

  openHat(t: number, vel = 0.8): void {
    if (!inWindow(t)) return;
    this.openHatNoise.triggerAttackRelease(0.2, t, vel);
  }

  shaker(t: number, vel = 0.8): void {
    if (!inWindow(t)) return;
    this.shakerNoise.triggerAttackRelease(0.03, t, vel);
  }

  rim(t: number, vel = 0.8): void {
    if (!inWindow(t)) return;
    this.rimSynth.triggerAttackRelease(1750, 0.02, t, vel);
  }

  tom(t: number, freq: number, vel = 0.9): void {
    if (!inWindow(t)) return;
    this.tomSynth.triggerAttackRelease(freq, 0.3, t, vel);
  }

  crash(t: number, vel = 0.9): void {
    if (!inWindow(t)) return;
    this.crashNoise.triggerAttackRelease(1.2, t, vel);
  }
}

/** Montée de bruit filtré (transition vers une section). */
export function riser(
  out: Tone.ToneAudioNode,
  t0: number,
  t1: number,
  volume: number,
  fromHz = 400,
  toHz = 9000,
): void {
  if (!inWindow(t0)) return;
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: {
      attack: t1 - t0,
      decay: 0.01,
      sustain: 1,
      release: 0.05,
      attackCurve: 'exponential',
    },
  });
  noise.volume.value = volume;
  const filter = new Tone.Filter({ type: 'bandpass', frequency: fromHz, Q: 1.4 });
  filter.frequency.setValueAtTime(fromHz, t0);
  filter.frequency.exponentialRampToValueAtTime(toHz, t1);
  chain(noise, filter, out);
  noise.triggerAttackRelease(t1 - t0, t0, 1);
}
