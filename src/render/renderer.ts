/**
 * Rendu Pixi du jeu : couches ParticleContainer synchronisées depuis l'ECS (positions
 * interpolées), boss et joueur en sprites, effets, caméra, décor, HUD. Lecture seule de la
 * simulation ; rendu déclenché par la boucle (pas de ticker Pixi).
 */
import { Application, Container, Sprite, Texture } from 'pixi.js';
import { BOSSES, ENEMIES } from '../content/data';
import { FRAME } from '../content/frames';
import { Foe, Gem, Life, Look, Pos, Status, Zone } from '../engine/components';
import type { EntityPool } from '../engine/pool';
import type { RunSim } from '../systems/sim';
import { ZONE } from '../systems/zones';
import { buildAtlas, type Atlas } from './atlas';
import { Background } from './background';
import { Camera } from './camera';
import { DamageNumbers, FxLayer } from './fx';
import { Hud, type HudState } from './hud';
import { SpriteLayer } from './layer';
import { ELEMENT_COLORS, particleColor, PALETTE } from './palette';

export interface QualitySettings {
  /** Échelle de résolution (1 = DPR plafonné à 2). */
  resolution: number;
  /** Quantité de particules (0 à 1). */
  particles: number;
  damageNumbers: boolean;
  /** Amplitude du tremblement d'écran (0 à 1). */
  shake: number;
  /** Réduction des flashs (accessibilité). */
  reduceFlashes: boolean;
}

export const DEFAULT_QUALITY: QualitySettings = {
  resolution: 1,
  particles: 1,
  damageNumbers: true,
  shake: 1,
  reduceFlashes: false,
};

/** Types d'ennemis orientés selon leur déplacement (les autres restent droits). */
const ROTATES = Uint8Array.from(
  ENEMIES.map((e) => (e.behavior === 'tank' || e.behavior === 'shooter' ? 0 : 1)),
);

export class GameRenderer {
  readonly camera = new Camera();
  readonly hud: Hud;
  readonly sparks: FxLayer;
  readonly rings: FxLayer;
  readonly beams: FxLayer;
  readonly numbers: DamageNumbers;
  width = 0;
  height = 0;
  safeTop = 0;
  safeBottom = 0;
  leftHanded = false;
  private readonly world = new Container();
  private readonly bg = new Background();
  private readonly zones: SpriteLayer;
  private readonly gems: SpriteLayer;
  private readonly enemies: SpriteLayer;
  private readonly marks: SpriteLayer;
  private readonly bullets: SpriteLayer;
  private readonly shots: SpriteLayer;
  private readonly orbits: SpriteLayer;
  private readonly player: Sprite;
  private readonly boss: Sprite;
  private readonly flash = new Sprite(Texture.WHITE);
  private flashAlpha = 0;
  private time = 0;
  private snapCamera = true;

  private constructor(
    readonly app: Application,
    readonly atlas: Atlas,
    readonly quality: QualitySettings,
  ) {
    const fx = atlas.fx;
    this.zones = new SpriteLayer(160, atlas.frames[FRAME.ZONE_RING], 'add');
    this.gems = new SpriteLayer(900, atlas.frames[FRAME.GEM_S], 'add');
    this.enemies = new SpriteLayer(1400, atlas.frames[FRAME.ENEMY_BASE], 'normal');
    this.marks = new SpriteLayer(1400, fx.spark, 'add', { rotation: false });
    this.bullets = new SpriteLayer(600, atlas.frames[FRAME.BULLET], 'add');
    this.shots = new SpriteLayer(2200, atlas.frames[FRAME.SHOT_FIRE], 'add');
    this.orbits = new SpriteLayer(32, atlas.frames[FRAME.ORB_FROST], 'add');
    this.sparks = new FxLayer(1600, fx.spark);
    this.rings = new FxLayer(160, fx.ring);
    this.beams = new FxLayer(420, fx.beam);
    this.numbers = new DamageNumbers(260, atlas.digits);
    this.player = new Sprite(atlas.frames[FRAME.PLAYER]);
    this.player.anchor.set(0.5);
    this.boss = new Sprite(atlas.frames[FRAME.BOSS_BASE]);
    this.boss.anchor.set(0.5);
    this.boss.visible = false;
    this.hud = new Hud(atlas);
    this.world.addChild(
      this.zones.container,
      this.gems.container,
      this.enemies.container,
      this.marks.container,
      this.boss,
      this.player,
      this.orbits.container,
      this.bullets.container,
      this.shots.container,
      this.sparks.layer.container,
      this.rings.layer.container,
      this.beams.layer.container,
      this.numbers.layer.container,
    );
    this.flash.alpha = 0;
    app.stage.addChild(this.bg.container, this.world, this.flash, this.hud.container);
    this.applyQuality();
  }

  static async create(
    parent: HTMLElement,
    quality: QualitySettings = DEFAULT_QUALITY,
  ): Promise<GameRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: parent,
      antialias: false,
      background: PALETTE.voidDeep,
      preference: 'webgl',
      resolution: Math.min(2, window.devicePixelRatio || 1) * quality.resolution,
      autoDensity: true,
      autoStart: false,
      powerPreference: 'high-performance',
    });
    app.ticker.stop();
    parent.appendChild(app.canvas);
    const r = new GameRenderer(app, buildAtlas(), quality);
    r.readSafeArea(parent);
    r.resize();
    app.renderer.on('resize', () => {
      r.resize();
    });
    return r;
  }

  applyQuality(): void {
    this.sparks.density = this.quality.particles;
    this.numbers.enabled = this.quality.damageNumbers;
    this.camera.shakeScale = this.quality.shake;
  }

  private readSafeArea(parent: HTMLElement): void {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    parent.appendChild(probe);
    const cs = getComputedStyle(probe);
    this.safeTop = parseFloat(cs.paddingTop) || 0;
    this.safeBottom = parseFloat(cs.paddingBottom) || 0;
    probe.remove();
  }

  resize(): void {
    this.width = this.app.screen.width;
    this.height = this.app.screen.height;
    this.camera.resize(this.width, this.height);
    this.bg.resize(this.width, this.height);
    this.flash.width = this.width;
    this.flash.height = this.height;
    this.hud.layout(this.width, this.height, this.safeTop, this.safeBottom, this.leftHanded);
  }

  // --- Effets (appelés par le répartiteur d'événements) --------------------------------------

  burst(
    x: number,
    y: number,
    color: number,
    count: number,
    speed: number,
    life = 0.45,
    size = 1,
  ): void {
    const n = Math.round(count * this.quality.particles);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const tex = i & 1 ? this.atlas.fx.shard : this.atlas.fx.spark;
      this.sparks.spawn(
        tex,
        x,
        y,
        Math.cos(a) * v,
        Math.sin(a) * v,
        life * (0.6 + Math.random() * 0.6),
        size * 1.2,
        size * 0.3,
        color,
        1,
        a,
        (Math.random() - 0.5) * 10,
        4,
      );
    }
  }

  ring(
    x: number,
    y: number,
    radius: number,
    color: number,
    life = 0.35,
    thin = false,
    alpha = 0.9,
  ): void {
    const tex = thin ? this.atlas.fx.ringThin : this.atlas.fx.ring;
    this.rings.spawn(tex, x, y, 0, 0, life, (radius / 58) * 0.3, radius / 58, color, alpha);
  }

  glow(x: number, y: number, radius: number, color: number, life = 0.25, alpha = 0.8): void {
    this.rings.spawn(
      this.atlas.fx.glow,
      x,
      y,
      0,
      0,
      life,
      radius / 30,
      (radius / 30) * 1.3,
      color,
      alpha,
    );
  }

  /** Éclair en zigzag de (x1, y1) à (x2, y2). */
  beam(x1: number, y1: number, x2: number, y2: number, color: number): void {
    const segments = 5;
    let ax = x1;
    let ay = y1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) + 1e-6;
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const off = i === segments ? 0 : (Math.random() - 0.5) * Math.min(26, len * 0.25);
      const bx = x1 + dx * t + nx * off;
      const by = y1 + dy * t + ny * off;
      const sx = bx - ax;
      const sy = by - ay;
      const l = Math.sqrt(sx * sx + sy * sy);
      const rot = Math.atan2(sy, sx);
      this.beams.spawn(
        this.atlas.fx.beam,
        ax,
        ay,
        0,
        0,
        0.14,
        l / 16,
        l / 16,
        color,
        1,
        rot,
        0,
        0,
        0.55,
        true,
      );
      this.beams.spawn(
        this.atlas.fx.beam,
        ax,
        ay,
        0,
        0,
        0.1,
        l / 16,
        l / 16,
        0xffffff,
        1,
        rot,
        0,
        0,
        0.22,
        true,
      );
      ax = bx;
      ay = by;
    }
    this.glow(x2, y2, 14, color, 0.14, 0.9);
  }

  number(eid: number, x: number, y: number, value: number, crit: boolean, color: number): void {
    this.numbers.add(eid, x, y, value, crit, color);
  }

  screenFlash(color: number, alpha: number): void {
    if (this.quality.reduceFlashes) alpha *= 0.25;
    this.flash.tint = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  // --- Rendu --------------------------------------------------------------------------------

  render(sim: RunSim, alpha: number, dt: number, hud: HudState): void {
    this.time += dt;
    const pe = sim.state.player.eid;
    const px = Pos.px[pe] + (Pos.x[pe] - Pos.px[pe]) * alpha;
    const py = Pos.py[pe] + (Pos.y[pe] - Pos.py[pe]) * alpha;
    const cam = this.camera;
    cam.follow(px, py, dt, this.snapCamera);
    this.snapCamera = false;
    const zoom = cam.zoom;
    this.world.scale.set(zoom);
    this.world.position.set(
      this.width / 2 - cam.x * zoom + cam.offsetX,
      this.height / 2 - cam.y * zoom + cam.offsetY,
    );
    this.bg.update(
      cam.x - cam.offsetX / zoom,
      cam.y - cam.offsetY / zoom,
      zoom,
      this.width,
      this.height,
      dt,
    );

    const w = sim.world;
    this.syncZones(w.zones, alpha);
    this.syncSimple(this.gems, w.gems, alpha, 0, true);
    this.syncEnemies(w.enemies, alpha);
    this.syncBoss(sim, alpha);
    this.syncSimple(this.orbits, w.orbits, alpha, Math.PI / 2, false);
    this.syncSimple(this.bullets, w.bullets, alpha, 0, false);
    this.syncSimple(this.shots, w.shots, alpha, 0, false);

    const f = this.atlas;
    this.player.texture = Look.flash[pe] > 0 ? f.flash[FRAME.PLAYER] : f.frames[FRAME.PLAYER];
    if (Look.flash[pe] > 0) Look.flash[pe] -= dt;
    this.player.position.set(px, py);
    this.player.rotation = Look.rot[pe];
    this.player.alpha = Look.alpha[pe];

    this.sparks.update(dt);
    this.rings.update(dt);
    this.beams.update(dt);
    this.numbers.update(dt);
    this.hud.update(hud, dt);
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3);
    }
    this.flash.alpha = this.flashAlpha;
    this.app.renderer.render(this.app.stage);
  }

  private syncSimple(
    layer: SpriteLayer,
    pool: EntityPool,
    alpha: number,
    rotOffset: number,
    pulse: boolean,
  ): void {
    const frames = this.atlas.frames;
    layer.begin();
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      const p = layer.next();
      if (!p) break;
      p.texture = frames[Look.frame[e]];
      p.x = Pos.px[e] + (Pos.x[e] - Pos.px[e]) * alpha;
      p.y = Pos.py[e] + (Pos.y[e] - Pos.py[e]) * alpha;
      p.rotation = Look.rot[e] + rotOffset;
      const s = pulse
        ? 1 + 0.12 * Math.sin(this.time * 6 + e) + (Gem.pull[e] ? 0.15 : 0)
        : Look.scale[e] || 1;
      p.scaleX = s;
      p.scaleY = s;
      p.color = particleColor(0xffffff, Look.alpha[e]);
    }
    layer.end();
  }

  private syncEnemies(pool: EntityPool, alpha: number): void {
    const frames = this.atlas.frames;
    const flash = this.atlas.flash;
    const layer = this.enemies;
    const marks = this.marks;
    layer.begin();
    marks.begin();
    const blink = Math.sin(this.time * 18) > 0;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      if (Life.hp[e] <= 0) continue;
      const p = layer.next();
      if (!p) break;
      const x = Pos.px[e] + (Pos.x[e] - Pos.px[e]) * alpha;
      const y = Pos.py[e] + (Pos.y[e] - Pos.py[e]) * alpha;
      p.texture = Look.flash[e] > 0 ? flash[Look.frame[e]] : frames[Look.frame[e]];
      p.x = x;
      p.y = y;
      p.rotation = ROTATES[Foe.type[e]] ? Look.rot[e] : 0;
      const s = Look.scale[e] || 1;
      p.scaleX = s;
      p.scaleY = s;
      let tint = 0xffffff;
      if (Status.freezeT[e] > 0) tint = 0x8fd8ff;
      else if (Status.brittleT[e] > 0) tint = 0xc9a8ff;
      else if (Status.shockT[e] > 0 && blink) tint = 0xfff3a0;
      else if (Status.burnT[e] > 0) tint = 0xffb489;
      else if (Status.chill[e] > 0.2) tint = 0xc4ecff;
      p.color = particleColor(tint, Look.alpha[e]);
      const m = Status.marks[e];
      if (m !== 0) {
        const mp = marks.next();
        if (mp) {
          let el = 0;
          while (!(m & (1 << el))) el++;
          mp.x = x;
          mp.y = y - ENEMY_MARK_OFFSET[Foe.type[e]];
          mp.scaleX = 1.3;
          mp.scaleY = 1.3;
          mp.color = particleColor(ELEMENT_COLORS[el], 0.95);
        }
      }
    }
    layer.end();
    marks.end();
  }

  private syncBoss(sim: RunSim, alpha: number): void {
    const b = sim.state.boss;
    const e = b.eid;
    if (e < 0 || !sim.world.boss.isActive(e)) {
      this.boss.visible = false;
      return;
    }
    const frame = FRAME.BOSS_BASE + b.defIndex;
    this.boss.visible = true;
    this.boss.texture = Look.flash[e] > 0 ? this.atlas.flash[frame] : this.atlas.frames[frame];
    this.boss.position.set(
      Pos.px[e] + (Pos.x[e] - Pos.px[e]) * alpha,
      Pos.py[e] + (Pos.y[e] - Pos.py[e]) * alpha,
    );
    this.boss.rotation = this.time * (b.state === 'execute' ? 2.4 : 0.5);
    this.boss.alpha = Look.alpha[e];
    const rage = b.def?.phases[b.phase]?.rage ?? false;
    this.boss.tint = rage
      ? 0xffa0d8
      : b.state === 'telegraph' && Math.sin(this.time * 30) > 0
        ? 0xfff0a0
        : 0xffffff;
  }

  private syncZones(pool: EntityPool, alpha: number): void {
    const frames = this.atlas.frames;
    const layer = this.zones;
    layer.begin();
    for (let i = 0; i < pool.count; i++) {
      const z = pool.active[i];
      const p = layer.next();
      if (!p) break;
      const kind = Zone.kind[z];
      p.texture = frames[Look.frame[z]];
      p.x = Pos.px[z] + (Pos.x[z] - Pos.px[z]) * alpha;
      p.y = Pos.py[z] + (Pos.y[z] - Pos.py[z]) * alpha;
      if (kind === ZONE.CHARGE_LINE) {
        p.anchorX = 0;
        p.rotation = Zone.rot[z];
        p.scaleX = Zone.w[z] / 64;
        p.scaleY = Zone.h[z] / 56;
        p.color = particleColor(PALETTE.red, 0.2 + 0.6 * Look.alpha[z]);
      } else {
        p.anchorX = 0.5;
        p.rotation = kind === ZONE.MINE ? this.time * 1.5 : 0;
        const s = Zone.r[z] / (kind === ZONE.VAPOR ? 60 : 58);
        p.scaleX = s;
        p.scaleY = s;
        const color =
          kind === ZONE.VAPOR ? 0xc4ecff : kind === ZONE.MINE ? PALETTE.red : PALETTE.violet;
        p.color = particleColor(color, Look.alpha[z] * (kind === ZONE.VAPOR ? 0.55 : 0.9));
      }
    }
    layer.end();
  }

  bossName(sim: RunSim): string | null {
    const b = sim.state.boss;
    return b.eid >= 0 && sim.world.boss.isActive(b.eid) ? (BOSSES[b.defIndex]?.name ?? null) : null;
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: true });
  }
}

const ENEMY_MARK_OFFSET = Float32Array.from(ENEMIES.map((e) => e.radius + 7));
