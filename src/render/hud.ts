/**
 * HUD en Pixi (écran) : barres d'XP, de PV et de Résonance, minuteur, éliminations, or,
 * armes, barre de boss, bandeau d'annonce, joystick, bouton de dash, texte de debug. Barres =
 * sprites mis à l'échelle (aucune géométrie reconstruite) ; textes mis à jour seulement quand
 * leur valeur change.
 */
import { t } from '../i18n';
import { Container, Sprite, Text, Texture, type TextStyleOptions } from 'pixi.js';
import { FRAME } from '../content/frames';
import { PALETTE } from './palette';
import type { Atlas } from './atlas';

const FONT = 'Chakra Petch, system-ui, sans-serif';

function style(
  size: number,
  color: number,
  weight: TextStyleOptions['fontWeight'] = '600',
): TextStyleOptions {
  return {
    fontFamily: FONT,
    fontSize: size,
    fill: color,
    fontWeight: weight,
    dropShadow: { color: 0x000000, alpha: 0.7, blur: 3, distance: 0, angle: 0 },
  };
}

class Bar {
  readonly bg = new Sprite(Texture.WHITE);
  readonly fill = new Sprite(Texture.WHITE);
  private w = 0;

  constructor(parent: Container, color: number) {
    this.bg.tint = 0x1a1230;
    this.bg.alpha = 0.85;
    this.fill.tint = color;
    parent.addChild(this.bg, this.fill);
  }

  place(x: number, y: number, w: number, h: number): void {
    this.w = w;
    this.bg.position.set(x, y);
    this.bg.width = w;
    this.bg.height = h;
    this.fill.position.set(x, y);
    this.fill.height = h;
  }

  set(ratio: number): void {
    this.fill.width = Math.max(0, Math.min(1, ratio)) * this.w;
  }
}

export interface HudState {
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  level: number;
  time: number;
  kills: number;
  /** Or de la run (fragments). */
  gold: number;
  gauge: number;
  gaugeMax: number;
  eveil: number;
  weapons: readonly { id: string; level: number; evolved: boolean }[];
  passives: readonly { id: string; level: number }[];
  bossName: string | null;
  bossRatio: number;
  dashReady: number;
  touch: boolean;
  joyActive: boolean;
  joyX: number;
  joyY: number;
  knobX: number;
  knobY: number;
  joyRadius: number;
  debug: string | null;
}

export class Hud {
  readonly container = new Container();
  private readonly xp: Bar;
  private readonly hp: Bar;
  private readonly res: Bar;
  private readonly boss: Bar;
  private readonly timer = new Text({ text: '00:00', style: style(22, PALETTE.ink, '700') });
  private readonly level = new Text({ text: 'NV 1', style: style(15, PALETTE.cyan, '700') });
  private readonly kills = new Text({ text: '0', style: style(15, PALETTE.ink) });
  private readonly gold = new Text({ text: '0', style: style(14, PALETTE.yellow, '700') });
  private readonly coin: Sprite;
  private readonly bannerTitle = new Text({ text: '', style: style(24, PALETTE.ink, '800') });
  private readonly bannerSub = new Text({ text: '', style: style(13, PALETTE.ink, '600') });
  /** Âge du bandeau affiché (s) et durée de maintien. */
  private bannerT = Infinity;
  private bannerHold = 2.4;
  private readonly hpText = new Text({ text: '', style: style(11, PALETTE.ink) });
  private readonly resText = new Text({
    text: t('hud.resonance'),
    style: style(10, 0xc9b8ff, '700'),
  });
  private readonly bossText = new Text({ text: '', style: style(13, 0x6ff7ff, '700') });
  private readonly debugText = new Text({
    text: '',
    style: { ...style(11, 0x9dffb0, '500'), fontFamily: 'monospace' },
  });
  private readonly icons: Sprite[] = [];
  private readonly iconLevels: Text[] = [];
  private readonly joyBase: Sprite;
  private readonly joyKnob: Sprite;
  private readonly dash: Sprite;
  private readonly dashFill: Sprite;
  private readonly dashText = new Text({ text: 'DASH', style: style(11, PALETTE.ink, '700') });
  private lastSecond = -1;
  private lastLevel = -1;
  private lastKills = -1;
  private lastGold = -1;
  private lastHp = -1;
  private weaponsKey = '';
  private dashX = 0;
  private dashY = 0;
  private time = 0;

  constructor(private readonly atlas: Atlas) {
    const c = this.container;
    this.xp = new Bar(c, PALETTE.cyan);
    this.hp = new Bar(c, PALETTE.magenta);
    this.res = new Bar(c, PALETTE.violet);
    this.boss = new Bar(c, 0x6ff7ff);
    this.timer.anchor.set(0.5, 0);
    this.kills.anchor.set(1, 0);
    this.gold.anchor.set(1, 0);
    this.coin = new Sprite(atlas.frames[FRAME.COIN]);
    this.coin.anchor.set(0.5);
    this.bannerTitle.anchor.set(0.5);
    this.bannerSub.anchor.set(0.5);
    this.bannerTitle.alpha = 0;
    this.bannerSub.alpha = 0;
    this.bossText.anchor.set(0.5, 1);
    this.debugText.anchor.set(1, 0);
    this.joyBase = new Sprite(atlas.fx.ringThin);
    this.joyKnob = new Sprite(atlas.fx.glow);
    this.dash = new Sprite(atlas.fx.ring);
    this.dashFill = new Sprite(atlas.fx.glow);
    for (const s of [this.joyBase, this.joyKnob, this.dash, this.dashFill]) s.anchor.set(0.5);
    this.dashText.anchor.set(0.5);
    this.joyKnob.tint = PALETTE.cyan;
    this.dash.tint = PALETTE.magenta;
    this.dashFill.tint = PALETTE.magenta;
    c.addChild(
      this.timer,
      this.level,
      this.kills,
      this.gold,
      this.coin,
      this.bannerTitle,
      this.bannerSub,
      this.hpText,
      this.resText,
      this.bossText,
      this.debugText,
      this.joyBase,
      this.joyKnob,
      this.dash,
      this.dashFill,
      this.dashText,
    );
  }

  get dashButton(): { x: number; y: number; r: number } {
    return { x: this.dashX, y: this.dashY, r: 46 };
  }

  layout(
    width: number,
    height: number,
    safeTop: number,
    safeBottom: number,
    leftHanded: boolean,
  ): void {
    const top = safeTop + 6;
    this.xp.place(0, safeTop, width, 5);
    this.level.position.set(12, top + 6);
    this.hp.place(12, top + 28, Math.min(170, width * 0.42), 9);
    this.hpText.position.set(16 + Math.min(170, width * 0.42), top + 24);
    this.res.place(12, top + 43, Math.min(170, width * 0.42), 6);
    this.resText.position.set(12, top + 51);
    this.timer.position.set(width / 2, top + 6);
    this.kills.position.set(width - 12, top + 8);
    this.gold.position.set(width - 12, top + 28);
    this.coin.position.set(width - 12 - 9, top + 37);
    this.debugText.position.set(width - 12, top + 50);
    this.bannerTitle.position.set(width / 2, top + 196);
    this.bannerSub.position.set(width / 2, top + 222);
    this.bannerTitle.style.wordWrapWidth = width - 32;
    this.bannerSub.style.wordWrapWidth = width - 32;
    // Sous les rangées d'icônes (armes : hp.y + 42, passifs : + 76 … + 124).
    const bw = Math.min(420, width * 0.7);
    this.boss.place((width - bw) / 2, top + 152, bw, 8);
    this.bossText.position.set(width / 2, top + 149);
    this.dashX = leftHanded ? 70 : width - 70;
    this.dashY = height - safeBottom - 90;
    this.dash.position.set(this.dashX, this.dashY);
    this.dashFill.position.set(this.dashX, this.dashY);
    this.dashText.position.set(this.dashX, this.dashY);
    this.dash.scale.set(0.62);
    this.weaponsKey = '';
  }

  update(s: HudState, dt: number): void {
    this.time += dt;
    this.xp.set(s.xp / s.xpNext);
    this.hp.set(s.hp / s.maxHp);
    if (Math.ceil(s.hp) !== this.lastHp) {
      this.lastHp = Math.ceil(s.hp);
      this.hpText.text = `${this.lastHp}/${Math.round(s.maxHp)}`;
    }
    if (s.eveil > 0) {
      // Éveil : jauge qui se vide, couleurs qui défilent.
      this.res.set(s.eveil);
      const hue = (this.time * 0.6) % 1;
      this.res.fill.tint = hue < 0.33 ? 0xff7a2f : hue < 0.66 ? 0x7fe8ff : 0xfff06a;
      this.resText.text = t('hud.eveil');
    } else {
      this.res.set(s.gauge / s.gaugeMax);
      this.res.fill.tint = s.gauge / s.gaugeMax > 0.8 ? 0xd98bff : PALETTE.violet;
      this.resText.text = t('hud.resonance');
    }
    const second = Math.floor(s.time);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      const m = Math.floor(second / 60);
      this.timer.text = `${String(m).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}`;
    }
    if (s.level !== this.lastLevel) {
      this.lastLevel = s.level;
      this.level.text = t('hud.level', { n: s.level });
    }
    if (s.kills !== this.lastKills) {
      this.lastKills = s.kills;
      this.kills.text = `${s.kills} ✦`;
    }
    const gold = Math.floor(s.gold);
    if (gold !== this.lastGold) {
      this.lastGold = gold;
      this.gold.text = String(gold);
      this.coin.x = this.gold.x - this.gold.width - 9;
    }
    this.updateBanner(dt);
    this.updateWeapons(s);
    const bossVisible = s.bossName !== null;
    this.boss.bg.visible = bossVisible;
    this.boss.fill.visible = bossVisible;
    this.bossText.visible = bossVisible;
    if (bossVisible) {
      this.boss.set(s.bossRatio);
      this.bossText.text = s.bossName ?? '';
    }
    this.debugText.visible = s.debug !== null;
    if (s.debug !== null) this.debugText.text = s.debug;

    const showJoy = s.touch && s.joyActive;
    this.joyBase.visible = showJoy;
    this.joyKnob.visible = showJoy;
    if (showJoy) {
      this.joyBase.position.set(s.joyX, s.joyY);
      this.joyBase.scale.set(s.joyRadius / 58);
      this.joyBase.alpha = 0.45;
      this.joyKnob.position.set(s.knobX, s.knobY);
      this.joyKnob.scale.set(0.9);
      this.joyKnob.alpha = 0.85;
    }
    this.dash.visible = s.touch;
    this.dashFill.visible = s.touch;
    this.dashText.visible = s.touch;
    if (s.touch) {
      this.dashFill.scale.set(0.2 + 1.3 * s.dashReady);
      this.dashFill.alpha = s.dashReady >= 1 ? 0.55 + 0.15 * Math.sin(this.time * 6) : 0.18;
      this.dash.alpha = s.dashReady >= 1 ? 0.95 : 0.35;
    }
  }

  /** Bandeau d'annonce (événement, élite) : remplace le précédent, s'efface seul. */
  /** Accent de Material You (option) : barre d'XP, niveau et joystick ; null : couleurs néon. */
  setAccent(color: number | null): void {
    const c = color ?? PALETTE.cyan;
    this.xp.fill.tint = c;
    this.level.style.fill = c;
    this.joyKnob.tint = c;
  }

  banner(title: string, subtitle: string, color: number, hold = 2.4): void {
    this.bannerTitle.text = title;
    this.bannerTitle.style.fill = color;
    this.bannerSub.text = subtitle;
    this.bannerT = 0;
    this.bannerHold = hold;
  }

  private updateBanner(dt: number): void {
    if (this.bannerT === Infinity) return;
    this.bannerT += dt;
    const t = this.bannerT;
    const a = t < 0.2 ? t / 0.2 : t < this.bannerHold ? 1 : 1 - (t - this.bannerHold) / 0.5;
    const alpha = Math.max(0, a);
    this.bannerTitle.alpha = alpha;
    this.bannerSub.alpha = alpha * 0.9;
    // Petit rebond d'entrée.
    const k = t < 0.2 ? 1.25 - 0.25 * (t / 0.2) : 1;
    this.bannerTitle.scale.set(k);
    if (alpha <= 0) this.bannerT = Infinity;
  }

  private updateWeapons(s: HudState): void {
    let key = '';
    for (const w of s.weapons) key += `${w.id}${w.level}${w.evolved ? '*' : ''};`;
    for (const q of s.passives) key += `|${q.id}${q.level}`;
    if (key === this.weaponsKey) return;
    this.weaponsKey = key;
    for (const i of this.icons) i.destroy();
    for (const t of this.iconLevels) t.destroy();
    this.icons.length = 0;
    this.iconLevels.length = 0;
    const y = this.hp.bg.y + 42;
    s.weapons.forEach((w, i) => {
      const icon = new Sprite(this.atlas.icons[w.id] ?? Texture.WHITE);
      icon.anchor.set(0.5);
      icon.scale.set(0.6);
      icon.position.set(26 + i * 34, y);
      const lvl = new Text({
        text: w.evolved ? '★' : String(w.level),
        style: style(10, w.evolved ? PALETTE.yellow : PALETTE.ink, '700'),
      });
      lvl.anchor.set(0.5, 0);
      lvl.position.set(26 + i * 34, y + 14);
      this.container.addChild(icon, lvl);
      this.icons.push(icon);
      this.iconLevels.push(lvl);
    });
    // Passifs : rangée plus petite sous les armes.
    const py = y + 34;
    s.passives.forEach((q, i) => {
      const icon = new Sprite(this.atlas.icons[q.id] ?? Texture.WHITE);
      icon.anchor.set(0.5);
      icon.scale.set(0.42);
      icon.alpha = 0.9;
      icon.position.set(22 + i * 24, py);
      const lvl = new Text({ text: String(q.level), style: style(8, PALETTE.ink, '700') });
      lvl.anchor.set(0.5, 0);
      lvl.position.set(22 + i * 24, py + 9);
      this.container.addChild(icon, lvl);
      this.icons.push(icon);
      this.iconLevels.push(lvl);
    });
  }
}
