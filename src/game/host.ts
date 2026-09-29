/**
 * Hôte d'une partie : relie la simulation, la boucle, le rendu, les contrôles, le game feel et
 * l'audio, et informe l'interface React des changements d'état (level-up, fin de run).
 */
import { PLAYER, RESONANCE } from '../content/data';
import { Life } from '../engine/components';
import { FixedLoop } from '../engine/loop';
import type { HudState } from '../render/hud';
import { DEFAULT_QUALITY, GameRenderer, type QualitySettings } from '../render/renderer';
import { benchTick, setupBench, type BenchConfig } from '../systems/bench';
import type { ControlPrefs, DisplayPrefs } from '../save/schema';
import { RunSim } from '../systems/sim';
import type { RunStatus } from '../systems/state';
import { dispatchEvents, type AudioSink } from './feel';
import { Haptics } from './haptics';
import { DEFAULT_INPUT, GameInput, type InputSettings } from './input';

export interface AudioBridge extends AudioSink {
  /** Appelé à chaque frame avec la simulation (intensité musicale, état du boss…). */
  update(sim: RunSim, dt: number, paused: boolean): void;
  startRun(sim: RunSim): void;
}

export class GameHost {
  sim: RunSim;
  readonly loop: FixedLoop;
  readonly haptics = new Haptics();
  audio: AudioBridge | null = null;
  bench: BenchConfig | null = null;
  showDebug = false;
  /** Rappel à chaque changement de statut de la run (level-up, mort, victoire…). */
  onStatus: (status: RunStatus) => void = () => undefined;
  onPauseRequest: () => void = () => undefined;
  fps = 60;

  /** Applique les préférences du joueur (contrôles, affichage) en cours de partie. */
  applyPrefs(c: ControlPrefs, d: DisplayPrefs): void {
    this.input.settings = { sensitivity: c.sensitivity, leftHanded: c.leftHanded, aim: c.aim };
    this.haptics.enabled = c.haptics;
    if (this.renderer.leftHanded !== c.leftHanded) {
      this.renderer.leftHanded = c.leftHanded;
      this.renderer.resize();
    }
    const q = this.renderer.quality;
    q.particles = d.particles;
    q.damageNumbers = d.damageNumbers;
    q.shake = d.shake;
    q.reduceFlashes = d.reduceFlashes;
    this.renderer.applyQuality();
    this.loop.fpsCap = d.fpsCap;
  }

  /** Réglages du menu debug (méthodes : l'UI React ne mute pas l'hôte directement). */
  setDebugOverlay(visible: boolean): void {
    this.showDebug = visible;
  }

  setTimeScale(scale: number): void {
    this.loop.timeScale = scale;
  }

  setInvincible(on: boolean): void {
    this.sim.state.debug.invincible = on;
  }

  private lastStatus: RunStatus = 'running';
  private hud: HudState;
  private weaponsKey = '';
  private debugTimer = 0;
  private debugText: string | null = null;

  private constructor(
    readonly renderer: GameRenderer,
    readonly input: GameInput,
    seed: string,
  ) {
    this.sim = new RunSim({ seed });
    this.loop = new FixedLoop({
      step: () => {
        this.step();
      },
      render: (a, dt) => {
        this.render(a, dt);
      },
    });
    this.hud = {
      hp: 0,
      maxHp: 1,
      xp: 0,
      xpNext: 1,
      level: 1,
      time: 0,
      kills: 0,
      gauge: 0,
      gaugeMax: RESONANCE.gaugeMax,
      eveil: 0,
      weapons: [],
      passives: [],
      bossName: null,
      bossRatio: 0,
      dashReady: 1,
      touch: false,
      joyActive: false,
      joyX: 0,
      joyY: 0,
      knobX: 0,
      knobY: 0,
      joyRadius: 58,
      debug: null,
    };
    input.onPause = () => {
      this.onPauseRequest();
    };
  }

  static async create(
    parent: HTMLElement,
    seed: string,
    quality: QualitySettings = DEFAULT_QUALITY,
    inputSettings: InputSettings = DEFAULT_INPUT,
  ): Promise<GameHost> {
    const renderer = await GameRenderer.create(parent, quality);
    renderer.leftHanded = inputSettings.leftHanded;
    const input = new GameInput(renderer.app.canvas, inputSettings, () => renderer.hud.dashButton);
    input.attach();
    return new GameHost(renderer, input, seed);
  }

  start(): void {
    this.audio?.startRun(this.sim);
    this.loop.start();
  }

  newRun(seed: string): void {
    this.sim = new RunSim({ seed });
    this.lastStatus = 'running';
    this.weaponsKey = '';
    if (this.bench) setupBench(this.sim, this.bench);
    this.audio?.startRun(this.sim);
    this.loop.paused = false;
  }

  startBench(cfg: BenchConfig): void {
    this.bench = cfg;
    setupBench(this.sim, cfg);
  }

  private step(): void {
    this.input.apply(this.sim.input);
    if (this.bench) benchTick(this.sim, this.bench);
    this.sim.step();
  }

  private render(alpha: number, dt: number): void {
    const sim = this.sim;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.1;
    dispatchEvents(sim, this.renderer, this.loop, this.haptics, this.audio);
    sim.events.clear();
    this.audio?.update(sim, dt, this.loop.paused);
    this.fillHud(dt);
    this.renderer.render(sim, alpha, dt, this.hud);
    if (sim.state.status !== this.lastStatus) {
      this.lastStatus = sim.state.status;
      this.onStatus(sim.state.status);
    }
  }

  private fillHud(dt: number): void {
    const st = this.sim.state;
    const h = this.hud;
    const p = st.player;
    h.hp = p.hp;
    h.maxHp = p.stats.maxHp;
    h.xp = p.xp;
    h.xpNext = p.xpNext;
    h.level = p.level;
    h.time = st.time;
    h.kills = st.stats.kills;
    h.gauge = st.resonance.gauge;
    h.eveil = st.resonance.eveilT / RESONANCE.eveil.duration;
    let key = '';
    for (const w of st.weapons) key += `${w.def.id}${w.level}${w.evolved ? '*' : ''}`;
    for (const q of st.passives) key += `|${q.def.id}${q.level}`;
    if (key !== this.weaponsKey) {
      this.weaponsKey = key;
      h.weapons = st.weapons.map((w) => ({
        id: w.evolved ? w.def.evolution.id : w.def.id,
        level: w.level,
        evolved: w.evolved,
      }));
      h.passives = st.passives.map((q) => ({ id: q.def.id, level: q.level }));
    }
    h.bossName = this.renderer.bossName(this.sim);
    const be = st.boss.eid;
    h.bossRatio = be >= 0 ? Math.max(0, lifeRatio(be)) : 0;
    h.dashReady = 1 - Math.max(0, p.dashCd) / (PLAYER.dash.cooldown * p.stats.dashCooldownMult);
    const input = this.input;
    h.touch = input.isTouch;
    h.joyActive = input.joyActive;
    h.joyX = input.joyX;
    h.joyY = input.joyY;
    h.knobX = input.knobX;
    h.knobY = input.knobY;
    h.joyRadius = input.radius;
    this.debugTimer -= dt;
    if (!this.showDebug) h.debug = null;
    else if (this.debugTimer <= 0) {
      this.debugTimer = 0.25;
      const w = this.sim.world;
      const s = this.loop.stats;
      this.debugText =
        `${this.fps.toFixed(0)} fps · sim ${s.simMs.toFixed(2)} ms · rendu ${s.renderMs.toFixed(2)} ms\n` +
        `ennemis ${w.enemies.count} · tirs ${w.shots.count} · balles ${w.bullets.count}\n` +
        `gemmes ${w.gems.count} · zones ${w.zones.count} · ×${this.loop.timeScale}`;
      h.debug = this.debugText;
    }
  }

  pause(): void {
    this.loop.paused = true;
  }

  resume(): void {
    this.loop.paused = false;
  }

  destroy(): void {
    this.loop.stop();
    this.input.detach();
    this.renderer.destroy();
  }
}

function lifeRatio(eid: number): number {
  return Life.hp[eid] / Math.max(1, Life.max[eid]);
}

export { DEFAULT_QUALITY };
