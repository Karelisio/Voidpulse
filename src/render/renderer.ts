/**
 * Rendu Pixi du jeu : couches ParticleContainer synchronisées depuis l'ECS (positions
 * interpolées), boss et joueur en sprites, effets, caméra, décor, HUD. Lecture seule de la
 * simulation ; rendu déclenché par la boucle (pas de ticker Pixi).
 */
import { Application, Container, Sprite, Texture } from 'pixi.js';
import {
  AFFIXES,
  BEHAVIOR_OF,
  BOSSES,
  CAMPAIGN,
  ENEMIES,
  ENEMY_PARAM,
  STAGES,
  WEAPONS,
  colorOf,
  type StageDef,
} from '../content/data';
import { FRAME } from '../content/frames';
import { Body, Foe, Gem, Life, Look, Pos, Status, Zone } from '../engine/components';
import { AFFIX, FROST_AURA_RADIUS } from '../systems/elites';
import { BEHAVIOR } from '../systems/enemies';
import type { EntityPool } from '../engine/pool';
import type { RunSim } from '../systems/sim';
import { ZONE } from '../systems/zones';
import { bossTextures, buildAtlas, type Atlas } from './atlas';
import { Background } from './background';
import { Camera } from './camera';
import { DamageNumbers, FxLayer } from './fx';
import { Hud, type HudState } from './hud';
import { SpriteLayer } from './layer';
import { ELEMENT_COLORS, mix, particleColor, PALETTE } from './palette';

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

/** Couleur de chaque type d'ennemi (surcouches : bouclier, aura). */
const ENEMY_TINT = Uint32Array.from(ENEMIES.map((e) => colorOf(e.color)));
/** Rayon d'aura des soutiens (0 pour les autres types). */
const SUPPORT_AURA = Float32Array.from(
  ENEMIES.map((_, i) => (BEHAVIOR_OF[i] === BEHAVIOR.support ? ENEMY_PARAM.auraRadius[i] : 0)),
);
/** Indicateurs hors écran : marchand, autel, faille, élites, coffres au sol. */
const MAX_ARROWS = 10;

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
  private readonly bg: Background;
  /** Brume du stage : seul un disque autour du joueur reste dégagé. */
  private readonly fog = new Sprite(fogTexture());
  private fogAlpha = 0;
  /** Bandes opaques autour du voile de brume (grands écrans). */
  private readonly fogEdges = new Container();
  /** Blizzard : voile glacé. */
  private readonly weatherVeil = new Sprite(Texture.WHITE);
  private weatherAlpha = 0;
  private readonly zones: SpriteLayer;
  private readonly gems: SpriteLayer;
  private readonly chests: SpriteLayer;
  private readonly enemies: SpriteLayer;
  private readonly marks: SpriteLayer;
  private readonly bullets: SpriteLayer;
  private readonly shots: SpriteLayer;
  private readonly orbits: SpriteLayer;
  private readonly shells: SpriteLayer;
  private readonly player: Sprite;
  private readonly boss: Sprite;
  private readonly flash = new Sprite(Texture.WHITE);
  /** Voile violet du temps suspendu (faille temporelle). */
  private readonly riftVeil = new Sprite(Texture.WHITE);
  private riftAlpha = 0;
  private readonly arrows = new Container();
  private flashAlpha = 0;
  private time = 0;
  private snapCamera = true;

  private constructor(
    readonly app: Application,
    readonly atlas: Atlas,
    readonly quality: QualitySettings,
    stage: StageDef,
  ) {
    const fx = atlas.fx;
    this.bg = new Background(stage);
    this.fog.anchor.set(0.5);
    // Brume laiteuse : fond du stage éclairci par sa teinte d'accent.
    this.fog.tint = mix(colorOf(stage.palette.base), colorOf(stage.palette.accent), 0.22);
    this.fog.visible = false;
    for (let i = 0; i < 4; i++) this.fogEdges.addChild(new Sprite(Texture.WHITE));
    this.fogEdges.visible = false;
    this.weatherVeil.tint = 0xcff4ff;
    this.weatherVeil.visible = false;
    this.zones = new SpriteLayer(600, atlas.frames[FRAME.ZONE_RING], 'add');
    this.chests = new SpriteLayer(8, atlas.frames[FRAME.CHEST], 'normal');
    this.gems = new SpriteLayer(900, atlas.frames[FRAME.GEM_S], 'add');
    this.enemies = new SpriteLayer(1400, atlas.frames[FRAME.ENEMY_BASE], 'normal');
    this.marks = new SpriteLayer(2400, fx.spark, 'add');
    this.shells = new SpriteLayer(96, atlas.frames[FRAME.SHELL], 'add');
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
      this.chests.container,
      this.enemies.container,
      this.marks.container,
      this.boss,
      this.player,
      this.orbits.container,
      this.shells.container,
      this.bullets.container,
      this.shots.container,
      this.sparks.layer.container,
      this.rings.layer.container,
      this.beams.layer.container,
      this.numbers.layer.container,
    );
    this.flash.alpha = 0;
    this.riftVeil.tint = 0x6a3dff;
    this.riftVeil.alpha = 0;
    for (let i = 0; i < MAX_ARROWS; i++) {
      const a = new Sprite(fx.arrow);
      a.anchor.set(0.5);
      a.visible = false;
      this.arrows.addChild(a);
    }
    app.stage.addChild(
      this.bg.container,
      this.world,
      this.fog,
      this.fogEdges,
      this.weatherVeil,
      this.riftVeil,
      this.flash,
      this.arrows,
      this.hud.container,
    );
    this.applyQuality();
  }

  static async create(
    parent: HTMLElement,
    quality: QualitySettings = DEFAULT_QUALITY,
    stage: StageDef = STAGES.proto ?? CAMPAIGN[0],
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
    const r = new GameRenderer(app, buildAtlas(), quality, stage);
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
    this.riftVeil.width = this.width;
    this.riftVeil.height = this.height;
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
    this.syncZones(sim, w.zones, alpha, px, py);
    this.syncSimple(this.gems, w.gems, alpha, 0, true);
    this.syncSimple(this.chests, w.chests, alpha, 0, false);
    this.syncEnemies(w.enemies, alpha);
    this.syncBoss(sim, alpha, dt);
    this.syncSimple(this.orbits, w.orbits, alpha, Math.PI / 2, false);
    this.syncSimple(this.bullets, w.bullets, alpha, 0, false);
    this.syncSimple(this.shots, w.shots, alpha, 0, false);

    const f = this.atlas;
    const pf = Look.frame[pe];
    this.player.texture = Look.flash[pe] > 0 ? f.flash[pf] : f.frames[pf];
    if (Look.flash[pe] > 0) Look.flash[pe] -= dt;
    this.player.position.set(px, py);
    this.player.rotation = Look.rot[pe];
    this.player.alpha = Look.alpha[pe];
    // Ralenti par le givre : teinte glacée.
    this.player.tint = sim.state.player.slowT > 0 ? 0xa8e6ff : 0xffffff;

    // Temps suspendu : voile violet qui s'installe puis se dissipe.
    const rift = sim.state.events.riftT > 0 ? 1 : 0;
    this.riftAlpha += (rift - this.riftAlpha) * Math.min(1, dt * 3);
    this.riftVeil.alpha = this.riftAlpha * (0.13 + 0.03 * Math.sin(this.time * 2));
    this.riftVeil.visible = this.riftAlpha > 0.01;
    this.syncWeather(sim, px, py, zoom, dt);
    this.syncArrows(sim);

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
      p.color = particleColor(Look.tint[e], Look.alpha[e]);
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
    const t = this.time;
    for (let i = 0; i < pool.count; i++) {
      const e = pool.active[i];
      if (Life.hp[e] <= 0) continue;
      const p = layer.next();
      if (!p) break;
      const x = Pos.px[e] + (Pos.x[e] - Pos.px[e]) * alpha;
      const y = Pos.py[e] + (Pos.y[e] - Pos.py[e]) * alpha;
      const type = Foe.type[e];
      p.texture = Look.flash[e] > 0 ? flash[Look.frame[e]] : frames[Look.frame[e]];
      p.x = x;
      p.y = y;
      p.rotation = Look.rot[e];
      const s = Look.scale[e] || 1;
      p.scaleX = s;
      p.scaleY = s;
      let tint = Look.tint[e];
      if (Status.freezeT[e] > 0) tint = 0x8fd8ff;
      else if (Status.brittleT[e] > 0) tint = 0xc9a8ff;
      else if (Status.shockT[e] > 0 && blink) tint = 0xfff3a0;
      else if (Status.burnT[e] > 0) tint = 0xffb489;
      else if (Status.chill[e] > 0.2) tint = 0xc4ecff;
      p.color = particleColor(tint, Look.alpha[e]);
      if (Foe.hidden[e] !== 0) continue;
      const r = Body.r[e];
      if (Foe.elite[e] !== 0) {
        const halo = marks.next();
        if (halo) {
          halo.texture = this.atlas.fx.ring;
          halo.x = x;
          halo.y = y;
          halo.rotation = 0;
          const hs = (r / 58) * (1.35 + 0.08 * Math.sin(t * 5 + e));
          halo.scaleX = hs;
          halo.scaleY = hs;
          halo.color = particleColor(ELITE_COLOR, 0.8);
        }
        if ((Foe.affix[e] & AFFIX.FROSTAURA) !== 0) {
          this.overlay(FRAME.AURA, x, y, t * 0.3, FROST_AURA_RADIUS / 58, FROST_TINT, 0.4);
        }
      }
      // Bouclier frontal : arc orienté, d'autant plus vif qu'il est intact.
      if (Foe.shield[e] > 0) {
        const max = Life.max[e] * ENEMY_PARAM.shield[type];
        const k = max > 0 ? Foe.shield[e] / max : 1;
        this.overlay(FRAME.SHIELD_ARC, x, y, Look.rot[e], r / 20, ENEMY_TINT[type], 0.35 + 0.6 * k);
      }
      if (Foe.bubble[e] > 0) {
        const k = Foe.bubble[e] / Math.max(1, Foe.bubbleMax[e]);
        this.overlay(FRAME.BUBBLE, x, y, t, (r * 1.45) / 28, BUBBLE_TINT, 0.3 + 0.5 * k);
      }
      if (Foe.guardT[e] > 0) {
        this.overlay(FRAME.GUARD, x, y - r - 11, 0, 1, GUARD_TINT, 0.9);
      }
      const aura = SUPPORT_AURA[type];
      if (aura > 0) {
        this.overlay(FRAME.AURA, x, y, -t * 0.25, aura / 58, ENEMY_TINT[type], 0.22);
      }
      const m = Status.marks[e];
      if (m !== 0) {
        const mp = marks.next();
        if (mp) {
          mp.texture = this.atlas.fx.spark;
          let el = 0;
          while (!(m & (1 << el))) el++;
          mp.x = x;
          mp.y = y - (r + 7);
          mp.rotation = 0;
          mp.scaleX = 1.3;
          mp.scaleY = 1.3;
          mp.color = particleColor(ELEMENT_COLORS[el], 0.95);
        }
      }
    }
    layer.end();
    marks.end();
  }

  /** Surcouche d'ennemi (couche des marques) : image, position, rotation, échelle, teinte. */
  private overlay(
    frame: number,
    x: number,
    y: number,
    rot: number,
    scale: number,
    color: number,
    a: number,
  ): void {
    const o = this.marks.next();
    if (!o) return;
    o.texture = this.atlas.frames[frame];
    o.x = x;
    o.y = y;
    o.rotation = rot;
    o.scaleX = scale;
    o.scaleY = scale;
    o.color = particleColor(color, a);
  }

  /** Flèches au bord de l'écran vers les points d'intérêt hors champ. */
  private syncArrows(sim: RunSim): void {
    const cam = this.camera;
    const zoom = cam.zoom;
    const cx = this.width / 2 + cam.offsetX;
    const cy = this.height / 2 + cam.offsetY;
    const margin = 26;
    const top = this.safeTop + 150;
    const bottom = this.height - this.safeBottom - 40;
    let n = 0;
    const show = (wx: number, wy: number, color: number): void => {
      if (n >= MAX_ARROWS) return;
      const sx = cx + (wx - cam.x) * zoom;
      const sy = cy + (wy - cam.y) * zoom;
      if (sx > margin && sx < this.width - margin && sy > top && sy < bottom) return;
      const dx = sx - cx;
      const dy = sy - cy;
      // Intersection de la direction avec le rectangle intérieur.
      const kx = dx !== 0 ? (dx > 0 ? this.width - margin - cx : margin - cx) / dx : Infinity;
      const ky = dy !== 0 ? (dy > 0 ? bottom - cy : top - cy) / dy : Infinity;
      const k = Math.min(kx, ky);
      const a = this.arrows.children[n++] as Sprite;
      a.visible = true;
      a.position.set(cx + dx * k, cy + dy * k);
      a.rotation = Math.atan2(dy, dx);
      a.tint = color;
      a.alpha = 0.75 + 0.25 * Math.sin(this.time * 6);
    };
    const zones = sim.world.zones;
    for (let i = 0; i < zones.count; i++) {
      const z = zones.active[i];
      const kind = Zone.kind[z];
      if (kind === ZONE.MERCHANT) show(Pos.x[z], Pos.y[z], PALETTE.yellow);
      else if (kind === ZONE.ALTAR) show(Pos.x[z], Pos.y[z], PALETTE.red);
      else if (kind === ZONE.RIFT) show(Pos.x[z], Pos.y[z], PALETTE.violet);
    }
    const chests = sim.world.chests;
    for (let i = 0; i < chests.count; i++) {
      const c = chests.active[i];
      show(Pos.x[c], Pos.y[c], ELITE_COLOR);
    }
    const enemies = sim.world.enemies;
    for (let i = 0; i < enemies.count && n < MAX_ARROWS; i++) {
      const e = enemies.active[i];
      if (Foe.elite[e] !== 0 && Life.hp[e] > 0) show(Pos.x[e], Pos.y[e], 0xffb13d);
    }
    for (let i = n; i < MAX_ARROWS; i++) this.arrows.children[i].visible = false;
  }

  /** Brume (vision réduite) et blizzard, pendant les vagues de la mécanique du stage. */
  private syncWeather(sim: RunSim, px: number, py: number, zoom: number, dt: number): void {
    const kind = sim.state.stage.mechanic.kind;
    const active = sim.state.mechanic.activeT > 0;
    const k = Math.min(1, dt * 1.5);
    this.fogAlpha += ((kind === 'fog' && active ? 1 : 0) - this.fogAlpha) * k;
    this.fog.visible = this.fogAlpha > 0.01;
    if (this.fog.visible) {
      // Le trou de la texture fait FOG_HOLE px : il doit couvrir FOG_VISION unités monde.
      const s = (FOG_VISION * zoom * (1 + 0.03 * Math.sin(this.time * 1.7))) / FOG_HOLE;
      this.fog.scale.set(s);
      this.fog.position.set(this.world.position.x + px * zoom, this.world.position.y + py * zoom);
      this.fog.alpha = this.fogAlpha;
      const h = (FOG_SIZE * s) / 2;
      const x0 = this.fog.x - h;
      const y0 = this.fog.y - h;
      const x1 = this.fog.x + h;
      const y1 = this.fog.y + h;
      const W = this.width;
      const H = this.height;
      const rects = [
        [0, 0, W, y0],
        [0, y1, W, H - y1],
        [0, y0, x0, y1 - y0],
        [x1, y0, W - x1, y1 - y0],
      ];
      for (let i = 0; i < 4; i++) {
        const e = this.fogEdges.children[i] as Sprite;
        const [x, y, w, hh] = rects[i];
        e.visible = w > 0 && hh > 0;
        e.position.set(x, y);
        e.width = Math.max(0, w);
        e.height = Math.max(0, hh);
        e.tint = this.fog.tint;
        e.alpha = this.fogAlpha * 0.97;
      }
    }
    this.fogEdges.visible = this.fog.visible;
    this.weatherAlpha += ((kind === 'ice' && active ? 1 : 0) - this.weatherAlpha) * k;
    this.weatherVeil.visible = this.weatherAlpha > 0.01;
    this.weatherVeil.alpha = this.weatherAlpha * (0.1 + 0.03 * Math.sin(this.time * 5));
  }

  private syncBoss(sim: RunSim, alpha: number, dt: number): void {
    const b = sim.state.boss;
    const e = b.eid;
    if (e < 0 || !sim.world.boss.isActive(e)) {
      this.boss.visible = false;
      return;
    }
    const tex = bossTextures(b.defIndex);
    this.boss.visible = true;
    this.boss.texture = Look.flash[e] > 0 ? tex.flash : tex.normal;
    const x = Pos.px[e] + (Pos.x[e] - Pos.px[e]) * alpha;
    const y = Pos.py[e] + (Pos.y[e] - Pos.py[e]) * alpha;
    this.boss.position.set(x, y);
    // L'avant du boss (+x) se tourne vers le joueur, sans à-coups.
    const pe = sim.state.player.eid;
    const want = Math.atan2(Pos.y[pe] - y, Pos.x[pe] - x);
    let d = want - this.boss.rotation;
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    this.boss.rotation += d * Math.min(1, (b.state === 'execute' ? 2 : 5) * dt);
    this.boss.alpha = Look.alpha[e];
    const rage = b.def?.phases[b.phase]?.rage ?? false;
    this.boss.tint = rage
      ? 0xffa0d8
      : b.state === 'telegraph' && Math.sin(this.time * 30) > 0
        ? 0xfff0a0
        : 0xffffff;
  }

  private syncZones(sim: RunSim, pool: EntityPool, alpha: number, px: number, py: number): void {
    const frames = this.atlas.frames;
    const layer = this.zones;
    const shells = this.shells;
    layer.begin();
    shells.begin();
    // Auras des armes : disque translucide centré sur le joueur.
    const weapons = sim.state.weapons;
    const area = sim.state.player.stats.areaMult;
    for (let i = 0; i < weapons.length; i++) {
      const w = weapons[i];
      if (w.def.archetype !== 'aura') continue;
      const p = layer.next();
      if (!p) break;
      const r = w.stats.range * area;
      p.texture = frames[FRAME.ZONE_POOL];
      p.x = px;
      p.y = py;
      p.anchorX = 0.5;
      p.rotation = this.time * 0.4;
      p.scaleX = r / 60;
      p.scaleY = r / 60;
      p.color = particleColor(AURA_TINT[w.defIndex], 0.3 + 0.06 * Math.sin(this.time * 3));
    }
    for (let i = 0; i < pool.count; i++) {
      const z = pool.active[i];
      const p = layer.next();
      if (!p) break;
      const kind = Zone.kind[z];
      p.texture = frames[Look.frame[z]];
      p.x = Pos.px[z] + (Pos.x[z] - Pos.px[z]) * alpha;
      p.y = Pos.py[z] + (Pos.y[z] - Pos.py[z]) * alpha;
      p.anchorX = 0.5;
      p.rotation = 0;
      const a = Look.alpha[z];
      let s = Zone.r[z] / 58;
      let color = Look.tint[z];
      switch (kind) {
        case ZONE.CHARGE_LINE:
        case ZONE.BEAM:
          p.anchorX = 0;
          p.rotation = Zone.rot[z];
          p.scaleX = Zone.w[z] / 64;
          p.scaleY = Zone.h[z] / 56;
          p.color =
            kind === ZONE.BEAM
              ? particleColor(color, 0.9 * a)
              : particleColor(color === 0xffffff ? PALETTE.red : color, 0.2 + 0.6 * a);
          continue;
        case ZONE.HAZARD:
          s = Zone.r[z] / 52;
          p.rotation = z * 1.7 + this.time * 0.15;
          p.color = particleColor(color, a * 0.55);
          break;
        case ZONE.MORTAR: {
          // Cible qui se resserre ; l'obus suit un arc de l'origine vers la cible.
          const life = Math.min(1, Zone.t[z] / Math.max(1e-3, Zone.dur[z]));
          s = (Zone.r[z] / 56) * (1.35 - 0.35 * life);
          p.rotation = this.time * 2;
          p.color = particleColor(color, 0.3 + 0.6 * life);
          const shell = shells.next();
          if (shell) {
            const ox = Zone.w[z];
            const oy = Zone.h[z];
            const height = Math.sin(Math.PI * life);
            shell.x = ox + (p.x - ox) * life;
            shell.y = oy + (p.y - oy) * life - height * 130;
            shell.rotation = 0;
            shell.scaleX = 0.9 + 0.6 * height;
            shell.scaleY = shell.scaleX;
            shell.color = particleColor(color, 1);
          }
          break;
        }
        case ZONE.WARN:
        case ZONE.VOLATILE: {
          const life = Math.min(1, Zone.t[z] / Math.max(1e-3, Zone.dur[z]));
          s = (Zone.r[z] / 56) * (1 + 0.05 * Math.sin(this.time * 24));
          p.rotation = -this.time * 1.5;
          p.color = particleColor(color, 0.35 + 0.6 * life);
          break;
        }
        case ZONE.MERCHANT:
        case ZONE.ALTAR:
        case ZONE.RIFT:
          s = kind === ZONE.RIFT ? 1 + 0.06 * Math.sin(this.time * 4) : 1;
          p.rotation = kind === ZONE.RIFT ? Look.rot[z] * 0.2 : 0;
          p.color = particleColor(0xffffff, a);
          if (kind === ZONE.ALTAR && Zone.param[z] > 0) {
            // Invocation en cours : anneau qui se referme vers l'autel.
            const ring = layer.next();
            if (ring) {
              ring.texture = this.atlas.fx.ring;
              ring.x = p.x;
              ring.y = p.y;
              ring.anchorX = 0.5;
              ring.rotation = 0;
              const k = (Zone.r[z] / 58) * (1.2 - 0.6 * Zone.param[z]);
              ring.scaleX = k;
              ring.scaleY = k;
              ring.color = particleColor(PALETTE.red, 0.4 + 0.5 * Zone.param[z]);
            }
          }
          break;
        case ZONE.VAPOR:
          s = Zone.r[z] / 60;
          color = 0xc4ecff;
          p.color = particleColor(color, a * 0.55);
          break;
        case ZONE.MINE:
          p.rotation = this.time * 1.5;
          p.color = particleColor(PALETTE.red, a * 0.9);
          break;
        case ZONE.PMINE:
          // Mine du joueur : taille du rayon de déclenchement, pulsation une fois armée.
          s = (Zone.w[z] / 58) * (Zone.state[z] === 2 ? 1.25 + 0.2 * Math.sin(this.time * 30) : 1);
          p.rotation = this.time * (Zone.state[z] === 2 ? 8 : 1);
          p.color = particleColor(color, a);
          break;
        case ZONE.POOL:
          s = Zone.r[z] / 60;
          p.rotation = this.time * 0.3 + z;
          p.color = particleColor(color, a * 0.7);
          break;
        case ZONE.STRIKE:
          s = (Zone.r[z] / 58) * (1.25 - 0.25 * a);
          p.color = particleColor(color, a);
          break;
        case ZONE.SURGE:
          s = 1.2 + 0.15 * Math.sin(this.time * 20 + z);
          p.color = particleColor(color, a);
          break;
        case ZONE.TERRAIN:
          s = (Zone.r[z] / 56) * (1 + 0.02 * Math.sin(this.time * 1.3 + z));
          p.rotation = Look.rot[z];
          p.color = particleColor(color, 0.55);
          break;
        case ZONE.PULL:
          s = Zone.r[z] / 60;
          p.rotation = -this.time * 2.2;
          p.color = particleColor(color, a * 0.85);
          break;
        case ZONE.WELL:
          s = Zone.r[z] / 60;
          p.rotation = Look.rot[z];
          p.color = particleColor(color, a * 0.9);
          break;
        default:
          p.color = particleColor(PALETTE.violet, a * 0.9);
      }
      p.scaleX = s;
      p.scaleY = s;
    }
    layer.end();
    shells.end();
  }

  bossName(sim: RunSim): string | null {
    const b = sim.state.boss;
    return b.eid >= 0 && sim.world.boss.isActive(b.eid) ? (BOSSES[b.defIndex]?.name ?? null) : null;
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: true });
  }
}

/** Rayon dégagé dans la brume (unités monde). */
const FOG_VISION = 230;
const FOG_SIZE = 512;
const FOG_HOLE = 70;

/** Voile de brume : transparent au centre (rayon FOG_HOLE), opaque au-delà, bords compris. */
function fogTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = FOG_SIZE;
  c.height = FOG_SIZE;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D indisponible');
  const m = FOG_SIZE / 2;
  const rg = g.createRadialGradient(m, m, FOG_HOLE * 0.6, m, m, FOG_HOLE * 1.6);
  rg.addColorStop(0, 'rgba(255,255,255,0)');
  rg.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  rg.addColorStop(1, 'rgba(255,255,255,0.97)');
  g.fillStyle = rg;
  g.fillRect(0, 0, FOG_SIZE, FOG_SIZE);
  return Texture.from(c);
}

const ELITE_COLOR = 0xffd23d;
const FROST_TINT = 0x8fd8ff;
const BUBBLE_TINT = colorOf(AFFIXES.find((a) => a.id === 'shielded')?.color ?? '#7dfcff');
const GUARD_TINT = 0x7dfcff;
const AURA_TINT = Uint32Array.from(WEAPONS.map((w) => colorOf(w.color)));
