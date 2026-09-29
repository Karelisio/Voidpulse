/**
 * Icônes néon (armes, évolutions, passifs, récompenses) dessinées en Canvas2D sur une grille de
 * 64 × 64 centrée en (0, 0) : cadre hexagonal à la couleur de l'objet + pictogramme propre à
 * chaque identifiant. Les évolutions reprennent le pictogramme de l'arme de base en version
 * « améliorée » (plus dense, plus lumineux) dans un double cadre dont le second trait est doré,
 * avec une étoile dorée. Formes simples et traits épais : lisibles à 30 px (HUD).
 */
import { PASSIVES, WEAPONS, colorOf, type ElementId } from '../content/data';
import { PALETTE, mix } from './palette';
import { Pen, circle, poly, type Ctx } from './pen';

type Path = (c: Ctx) => void;
type Glyph = (p: Pen, color: number, evo: boolean) => void;

const TAU = Math.PI * 2;
const GOLD = PALETTE.yellow;
const FLAME_HOT = 0xffe16a;
const hot = (color: number, t = 0.6): number => mix(color, 0xffffff, t);
const deep = (color: number, t = 0.7): number => mix(color, PALETTE.void, t);

// --- Outils de tracé ---------------------------------------------------------------------

/** Crayon des évolutions : tous les halos sont renforcés. */
class GlowPen extends Pen {
  constructor(
    base: Pen,
    private readonly boost: number,
  ) {
    super(base.ctx, base.white);
  }

  override stroke(color: number, width: number, glow: number, path: Path): void {
    super.stroke(color, width, glow * this.boost, path);
  }

  override fill(color: number, alpha: number, path: Path, glow = 0): void {
    super.fill(color, alpha, path, glow * this.boost);
  }
}

/** Trait sans halo, à opacité réglable (pistes, repères, éléments secondaires). */
function trace(
  p: Pen,
  color: number,
  alpha: number,
  width: number,
  path: Path,
  dash?: number[],
): void {
  const c = p.ctx;
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = p.col(color, alpha);
  c.lineWidth = width;
  if (dash) c.setLineDash(dash);
  c.beginPath();
  path(c);
  c.stroke();
  c.restore();
}

/** Forme unitaire posée en (x, y), mise à l'échelle `s` puis tournée de `rot` (radians). */
const at =
  (shape: Path, x: number, y: number, s: number, rot = 0): Path =>
  (c) => {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(s, s);
    shape(c);
    c.restore();
  };

const circleAt =
  (r: number, x = 0, y = 0): Path =>
  (c) => {
    circle(c, r, x, y);
  };

const hexPath =
  (r: number): Path =>
  (c) => {
    poly(c, 6, r, Math.PI / 6);
  };

/** Arc de cercle centré en (0, 0). */
const arcPath =
  (r: number, a0: number, a1: number): Path =>
  (c) => {
    c.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    c.arc(0, 0, r, a0, a1);
  };

/** Polyligne [x0, y0, x1, y1, …], fermée si `close`. */
const lines =
  (coords: number[], close = false): Path =>
  (c) => {
    c.moveTo(coords[0], coords[1]);
    for (let i = 2; i < coords.length; i += 2) c.lineTo(coords[i], coords[i + 1]);
    if (close) c.closePath();
  };

/** Éclair en zigzag entre deux points. */
function zig(c: Ctx, x0: number, y0: number, x1: number, y1: number, kinks = 3, amp = 3.2): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  c.moveTo(x0, y0);
  for (let i = 1; i <= kinks; i++) {
    const t = i / (kinks + 1);
    const o = (i % 2 === 0 ? -1 : 1) * amp;
    c.lineTo(x0 + dx * t - (dy / len) * o, y0 + dy * t + (dx / len) * o);
  }
  c.lineTo(x1, y1);
}

/** Étoile à `n` branches (rayon `r`, creux `inner` × r). */
function star(c: Ctx, x: number, y: number, r: number, n = 5, inner = 0.45): void {
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i / (n * 2)) * TAU;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}

const starAt =
  (x: number, y: number, r: number, n = 5, inner = 0.45): Path =>
  (c) => {
    star(c, x, y, r, n, inner);
  };

// --- Emblèmes d'éléments (formes unitaires : rayon ≈ 1) -----------------------------------

const FLAME: Path = (c) => {
  c.moveTo(0, 1);
  c.bezierCurveTo(-0.85, 1, -1, 0.15, -0.5, -0.45);
  c.bezierCurveTo(-0.5, -0.1, -0.3, 0, -0.15, -0.15);
  c.bezierCurveTo(0, -0.5, -0.05, -0.8, 0.15, -1);
  c.bezierCurveTo(0.35, -0.55, 0.95, -0.1, 0.9, 0.4);
  c.bezierCurveTo(0.85, 0.85, 0.45, 1, 0, 1);
  c.closePath();
};

const FLAKE: Path = (c) => {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI - Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    c.moveTo(ca, sa);
    c.lineTo(-ca, -sa);
    for (const d of [1, -1]) {
      const bx = ca * 0.55 * d;
      const by = sa * 0.55 * d;
      for (const k of [-1, 1]) {
        const b = a + (Math.PI / 3) * k * d;
        c.moveTo(bx, by);
        c.lineTo(bx + Math.cos(b) * 0.32 * d * d, by + Math.sin(b) * 0.32 * d * d);
      }
    }
  }
};

const BOLT: Path = (c) => {
  c.moveTo(0.3, -1);
  c.lineTo(-0.6, 0.15);
  c.lineTo(-0.05, 0.15);
  c.lineTo(-0.3, 1);
  c.lineTo(0.6, -0.2);
  c.lineTo(0.05, -0.2);
  c.closePath();
};

const DROP: Path = (c) => {
  c.moveTo(0, -1);
  c.bezierCurveTo(0.25, -0.55, 0.75, -0.15, 0.75, 0.3);
  c.arc(0, 0.3, 0.75, 0, Math.PI);
  c.bezierCurveTo(-0.75, -0.15, -0.25, -0.55, 0, -1);
  c.closePath();
};

const EYE: Path = (c) => {
  c.moveTo(-1, 0);
  c.quadraticCurveTo(0, -1.15, 1, 0);
  c.quadraticCurveTo(0, 1.15, -1, 0);
  c.closePath();
};

const SWIRL: Path = (c) => {
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const a = t * TAU * 1.6;
    const r = 0.1 + 0.9 * t;
    if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
};

/** Petit emblème de l'élément (flamme, flocon, éclair, goutte, œil, spirale du vide). */
function emblem(p: Pen, el: ElementId, color: number, x: number, y: number, s: number): void {
  switch (el) {
    case 'fire':
      p.fill(color, 0.95, at(FLAME, x, y, s), 8);
      p.fill(FLAME_HOT, 1, at(FLAME, x, y + s * 0.4, s * 0.45));
      break;
    case 'frost':
      p.stroke(color, 2.4, 6, at(FLAKE, x, y, s));
      break;
    case 'lightning':
      p.fill(color, 1, at(BOLT, x, y, s), 8);
      break;
    case 'poison':
      p.fill(color, 0.9, at(DROP, x, y, s), 8);
      p.fill(hot(color, 0.8), 0.9, circleAt(s * 0.2, x - s * 0.2, y + s * 0.3));
      break;
    case 'arcane':
      p.stroke(color, 2.2, 6, at(EYE, x, y, s));
      p.fill(hot(color), 1, circleAt(s * 0.3, x, y), 6);
      break;
    case 'void':
      p.stroke(color, 2.4, 6, at(SWIRL, x, y, s));
      break;
  }
}

// --- Armes : feu -------------------------------------------------------------------------

const COMET: Path = (c) => {
  c.moveTo(-17, 0);
  c.bezierCurveTo(-6, -3, 0, -7.5, 9, -7.5);
  c.arc(9, 0, 7.5, -Math.PI / 2, Math.PI / 2);
  c.bezierCurveTo(0, 7.5, -6, 3, -17, 0);
  c.closePath();
};

const COMET_CORE: Path = (c) => {
  c.moveTo(-6, 0);
  c.bezierCurveTo(0, -1.5, 3, -3.6, 8, -3.6);
  c.arc(8, 0, 3.6, -Math.PI / 2, Math.PI / 2);
  c.bezierCurveTo(3, 3.6, 0, 1.5, -6, 0);
  c.closePath();
};

/** Fuseau effilé le long d'un arc de rayon r : épaisseur w en `a`, nulle en `a - span`. */
const taper =
  (r: number, a: number, span: number, w: number): Path =>
  (c) => {
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const rr = r + w * (1 - t);
      const x = Math.cos(a - span * t) * rr;
      const y = Math.sin(a - span * t) * rr;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n;
      const rr = r - w * (1 - t);
      c.lineTo(Math.cos(a - span * t) * rr, Math.sin(a - span * t) * rr);
    }
    c.closePath();
  };

function ember(p: Pen, color: number, evo: boolean): void {
  const comet = (x: number, y: number, s: number, rot: number): void => {
    p.fill(color, 0.9, at(COMET, x, y, s, rot), 10);
    p.fill(FLAME_HOT, 1, at(COMET_CORE, x, y, s, rot));
  };
  const a = -Math.PI / 4;
  if (!evo) {
    comet(1, -1, 1.25, a);
    for (const [x, y, r] of [
      [-17, 7, 1.7],
      [-7, 16, 1.5],
      [-19, 16, 1.2],
    ]) {
      p.fill(FLAME_HOT, 0.9, circleAt(r, x, y), 5);
    }
    return;
  }
  // Salve : cinq comètes en pointe de flèche ; la meneuse explose en étoile à l'impact.
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const formation: [number, number, number][] = [
    [2, 0, 0.8],
    [-1, -10, 0.6],
    [-1, 10, 0.6],
    [-11, -5, 0.5],
    [-11, 5, 0.5],
  ];
  for (const [f, l, s] of formation) comet(dx * f - dy * l, dy * f + dx * l, s, a);
  p.fill(FLAME_HOT, 1, starAt(9.5, -9.5, 5.4, 4, 0.35), 10);
}

function flamewheel(p: Pen, color: number, evo: boolean): void {
  const r = evo ? 17.5 : 15.5;
  const n = evo ? 6 : 2;
  const br = evo ? 4.4 : 5.6;
  if (evo) p.stroke(color, 2, 8, circleAt(r));
  else trace(p, color, 0.45, 2, circleAt(r), [3, 3]);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU + (evo ? 0 : 0.5);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    p.fill(color, 0.6, taper(r, a - 0.1, evo ? 0.6 : 1.1, br * 0.9));
    p.fill(color, 0.95, circleAt(br, x, y), 9);
    p.fill(FLAME_HOT, 1, circleAt(br * 0.5, x, y));
  }
  p.fill(color, 0.9, circleAt(2.6), 6);
}

function brazier(p: Pen, color: number, evo: boolean): void {
  if (evo) p.stroke(color, 2.4, 8, circleAt(19.5));
  else trace(p, color, 0.55, 2.2, circleAt(20.5), [4, 4]);
  const s = evo ? 13.5 : 12;
  p.fill(color, 0.95, at(FLAME, 0, -3, s), 12);
  p.fill(FLAME_HOT, 1, at(FLAME, 0, 1, s * 0.46));
  if (evo) {
    p.fill(color, 0.9, at(FLAME, -10.5, 1, 6.5), 8);
    p.fill(color, 0.9, at(FLAME, 10.5, 1, 6.5), 8);
  }
  const bowl: Path = evo
    ? lines([-12, 15, -7, 6, 7, 6, 12, 15], true)
    : (c) => {
        c.moveTo(-11, 6);
        c.lineTo(11, 6);
        c.bezierCurveTo(10, 15, 5, 17, 0, 17);
        c.bezierCurveTo(-5, 17, -10, 15, -11, 6);
        c.closePath();
      };
  p.fill(deep(color, 0.5), 0.9, bowl);
  p.stroke(color, 3, 8, bowl);
}

function firemine(p: Pen, color: number, evo: boolean): void {
  const mine = (x: number, y: number, r: number): void => {
    p.fill(deep(color, 0.55), 0.95, circleAt(r, x, y));
    p.stroke(color, r > 7 ? 3 : 2.6, 8, (c) => {
      circle(c, r, x, y);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.PI / 8;
        c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        c.lineTo(x + Math.cos(a) * (r + r * 0.6), y + Math.sin(a) * (r + r * 0.6));
      }
    });
    p.fill(FLAME_HOT, 1, at(FLAME, x, y, r * 0.5), 6);
  };
  if (!evo) {
    trace(p, color, 0.5, 2, circleAt(19.5), [3.5, 3.5]);
    mine(0, 0, 8.5);
    return;
  }
  mine(0, -8, 6);
  mine(-11, 3, 6);
  mine(11, 3, 6);
  for (let i = 0; i < 5; i++) {
    p.fill(color, 0.9, at(FLAME, -14 + i * 7, 16, i % 2 === 0 ? 4.4 : 3.4), 6);
  }
}

function phoenix(p: Pen, color: number, evo: boolean): void {
  const wingR: Path = lines(
    [1.5, -5, 8, -12, 15, -17, 21, -16, 15.5, -10, 21, -8, 14.5, -3, 19, 1, 10, 1.5, 2, 4],
    true,
  );
  const wingL: Path = lines(
    [
      -1.5, -5, -8, -12, -15, -17, -21, -16, -15.5, -10, -21, -8, -14.5, -3, -19, 1, -10, 1.5, -2,
      4,
    ],
    true,
  );
  const bird = (x: number, y: number, s: number, rot: number): void => {
    for (const wing of [wingR, wingL]) {
      p.fill(color, 0.5, at(wing, x, y, s, rot), 8);
      p.stroke(color, 2.4, 8, at(wing, x, y, s, rot));
    }
    // Queue de flammes, corps effilé, tête et bec.
    p.fill(color, 0.95, at(FLAME, x, y + 13 * s, 8 * s, rot + Math.PI), 8);
    p.fill(color, 0.9, at(FLAME, x + 5 * s, y + 12 * s, 5 * s, rot + Math.PI - 0.35), 6);
    p.fill(color, 0.9, at(FLAME, x - 5 * s, y + 12 * s, 5 * s, rot + Math.PI + 0.35), 6);
    p.fill(color, 0.95, at(ellipseAt(3.6, 9.5, 0, -1), x, y, s, rot), 8);
    p.fill(FLAME_HOT, 1, at(circleAt(3.4, 0, -11), x, y, s, rot));
    p.fill(FLAME_HOT, 1, at(lines([-2, -13, 0, -19, 2, -13], true), x, y, s, rot));
  };
  if (evo) {
    bird(-12.5, 11, 0.42, -0.3);
    bird(12.5, 11, 0.42, 0.3);
  }
  bird(0, 1, evo ? 0.85 : 1, 0);
}

// --- Armes : givre -----------------------------------------------------------------------

const SHARD: Path = lines([1, 0, 0.35, -0.5, -0.45, -0.42, -1, 0, -0.45, 0.42, 0.35, 0.5], true);

function frost(p: Pen, color: number, evo: boolean): void {
  const r = evo ? 17 : 15.5;
  const n = evo ? 8 : 3;
  if (evo) p.stroke(color, 1.8, 8, circleAt(r));
  else trace(p, color, 0.45, 2, circleAt(r), [3, 3]);
  const s = evo ? 5.8 : 8;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    const shard = at(SHARD, Math.cos(a) * r, Math.sin(a) * r, s, a + Math.PI / 2);
    p.fill(color, 0.5, shard, 8);
    p.stroke(color, 2.4, 8, shard);
  }
  emblem(p, 'frost', color, 0, 0, evo ? 6.5 : 5.5);
}

const LANCE_HEAD: Path = lines([23, 0, 11, -6.5, 1, -4, -1, 0, 1, 4, 11, 6.5], true);
const LANCE_RIDGE: Path = lines([22, 0, 0, 0]);
const LANCE_SHAFT: Path = lines([-21, 0, 1, 0]);

function icelance(p: Pen, color: number, evo: boolean): void {
  const lance = (x: number, y: number, s: number, rot: number): void => {
    p.stroke(color, 4, 8, at(LANCE_SHAFT, x, y, s, rot));
    p.fill(color, 0.55, at(LANCE_HEAD, x, y, s, rot), 8);
    p.stroke(color, 2.6, 8, at(LANCE_HEAD, x, y, s, rot));
    trace(p, hot(color, 0.8), 0.9, 1.6, at(LANCE_RIDGE, x, y, s, rot));
  };
  const a = -Math.PI / 4;
  if (!evo) {
    lance(0, 0, 1, a);
    return;
  }
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  for (const [off, fwd] of [
    [-10, -4],
    [0, 4],
    [10, -4],
  ]) {
    lance(-dy * off + dx * fwd, dx * off + dy * fwd, 0.85, a);
  }
  for (const [x, y] of [
    [15, -2],
    [-2, 15],
    [-14, -14],
  ]) {
    p.fill(hot(color, 0.4), 0.9, at(SHARD, x, y, 3.2, a), 6);
  }
}

function glacialwave(p: Pen, color: number, evo: boolean): void {
  const gaps = evo ? 6 : 4;
  for (let i = 0; i < gaps; i++) {
    const a = (i / gaps) * TAU - Math.PI / 2;
    const half = (TAU / gaps) * 0.32;
    p.stroke(color, 2.6, 8, arcPath(19.5, a - half, a + half));
  }
  if (evo) p.stroke(color, 2.6, 8, circleAt(15));
  p.stroke(color, 2.8, 8, circleAt(evo ? 10 : 12));
  emblem(p, 'frost', color, 0, 0, evo ? 5.5 : 6.5);
}

function blizzard(p: Pen, color: number, evo: boolean): void {
  const rows = evo ? 6 : 5;
  for (let i = evo ? 1 : 0; i < rows; i++) {
    const t = i / (rows - 1);
    const y = -15 + 30 * t;
    const hw = 17.5 * (1 - t) + 3.5 * t;
    const off = i % 2 === 0 ? -1.5 : 1.5;
    p.stroke(color, 3.2, 8, (c) => {
      c.moveTo(off - hw, y);
      c.quadraticCurveTo(off, y + 2.6, off + hw, y);
    });
  }
  if (evo) {
    // Œil de la tempête : ellipse au sommet, pupille claire.
    p.stroke(color, 3.2, 8, ellipseAt(17, 4.6, 0, -15));
    p.fill(hot(color, 0.7), 1, circleAt(2.4, 0, -15), 8);
  }
  const dots: [number, number][] = evo
    ? [
        [-19, 6],
        [18, -4],
        [-13, 18],
        [15, 14],
        [20, 6],
      ]
    : [
        [-18, 6],
        [17, -3],
        [12, 16],
      ];
  for (const [x, y] of dots) p.fill(hot(color, 0.7), 1, circleAt(2, x, y), 6);
}

/** Croissant aux pointes effilées (rayon extérieur 1, pointes vers +x). */
const CRESCENT: Path = (c) => {
  c.moveTo(0.5299, 0.848);
  c.arc(0, 0, 1, 1.0123, TAU - 1.0123);
  c.arc(0.3, 0, 0.8786, -1.3057, 1.3057, true);
  c.closePath();
};

function frostblade(p: Pen, color: number, evo: boolean): void {
  const blade = (x: number, y: number, s: number, rot: number): void => {
    p.fill(color, 0.45, at(CRESCENT, x, y, s, rot), 8);
    p.stroke(color, 2.8, 8, at(CRESCENT, x, y, s, rot));
  };
  if (!evo) {
    // Images rémanentes : la lame tournoie.
    trace(p, color, 0.22, 2, at(CRESCENT, 0, 0, 18, -1.95));
    trace(p, color, 0.4, 2.2, at(CRESCENT, 0, 0, 18, -1.3));
    blade(-1, 1, 18, -0.7);
    return;
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU - Math.PI / 4;
    blade(Math.cos(a) * 8, Math.sin(a) * 8, 11, a - 0.4);
  }
  p.fill(hot(color, 0.7), 1, circleAt(2.6), 8);
}

// --- Armes : foudre ----------------------------------------------------------------------

function node(p: Pen, color: number, x: number, y: number, r: number): void {
  p.fill(color, 0.45, circleAt(r, x, y));
  p.stroke(color, 2.4, 6, circleAt(r, x, y));
  p.fill(hot(color, 0.8), 1, circleAt(r * 0.42, x, y), 6);
}

function arc(p: Pen, color: number, evo: boolean): void {
  const nodes: [number, number][] = [
    [-14, 14],
    [2, 0],
    [14, -14],
  ];
  p.stroke(color, 3.4, 9, (c) => {
    zig(c, nodes[0][0], nodes[0][1], nodes[1][0], nodes[1][1], 2, 5.5);
    zig(c, nodes[1][0], nodes[1][1], nodes[2][0], nodes[2][1], 2, 5.5);
    if (evo) {
      zig(c, 2, 0, -13, -11, 2, 4);
      zig(c, 2, 0, 16, 11, 2, 4);
    }
  });
  for (const [x, y] of nodes) node(p, color, x, y, 5);
  if (evo) {
    node(p, color, -14, -12, 3.6);
    node(p, color, 17, 12, 3.6);
  }
}

function railgun(p: Pen, color: number, evo: boolean): void {
  const beams = evo ? [-5.5, 5.5] : [0];
  const railY = evo ? 13 : 8;
  // Culasse, deux rails, puis le trait d'énergie qui traverse tout.
  const breech = lines([-20, -railY - 2, -15, -railY - 2, -15, railY + 2, -20, railY + 2], true);
  p.fill(color, 0.6, breech, 8);
  p.stroke(color, 2.6, 7, breech);
  p.stroke(color, 3.4, 7, (c) => {
    for (const y of [-railY, railY]) {
      c.moveTo(-15, y);
      c.lineTo(-3, y);
    }
  });
  for (const y of beams) {
    p.stroke(color, evo ? 5 : 6.4, 13, lines([-4, y, 17, y]));
    p.fill(hot(color, 0.8), 1, starAt(-4, y, 6.5, 4, 0.3), 10);
    p.fill(hot(color, 0.8), 1, starAt(17.5, y, 4.2, 4, 0.3), 8);
  }
}

function voltdisc(p: Pen, color: number, evo: boolean): void {
  const tilt = -0.45;
  // Disque incliné : jante elliptique, épaisseur visible dessous, éclair au centre.
  const disc = (x: number, y: number, s: number): void => {
    const rim = at(ellipseAt(1, 0.56), x, y, 16 * s, tilt);
    p.fill(color, 0.25, rim, 8);
    p.stroke(color, s > 0.8 ? 3.2 : 2.6, 9, rim);
    trace(p, color, 0.7, 2.2, at(ellipseAt(0.5, 0.28), x, y, 16 * s, tilt));
    p.fill(hot(color, 0.7), 1, at(BOLT, x, y, 5.6 * s), 8);
  };
  const spark = (x: number, y: number, a: number, len: number): void => {
    p.stroke(color, 2.6, 8, (c) => {
      zig(c, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 2, 2.6);
    });
  };
  if (!evo) {
    spark(15, -8, tilt - 0.3, 7);
    spark(-15, 8, tilt + Math.PI - 0.3, 7);
    spark(2, -11, -Math.PI / 2, 6);
    disc(0, 1, 1);
    return;
  }
  const spots: [number, number][] = [
    [0, -10],
    [-10, 8],
    [10, 8],
  ];
  for (const [x, y] of spots) disc(x, y, 0.55);
  spark(12, -9, -0.7, 6);
  spark(-12, -9, -Math.PI + 0.7, 6);
  spark(0, 17, Math.PI / 2, 5);
}

function discharge(p: Pen, color: number, evo: boolean): void {
  p.stroke(color, 3.2, 9, (c) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const len = i % 2 === 0 ? 20 : 14.5;
      zig(c, Math.cos(a) * 7, Math.sin(a) * 7, Math.cos(a) * len, Math.sin(a) * len, 2, 3);
    }
  });
  if (evo) {
    p.stroke(color, 2, 6, circleAt(11));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 8;
      p.fill(hot(color, 0.8), 1, circleAt(2.8, Math.cos(a) * 20, Math.sin(a) * 20), 8);
    }
  }
  p.fill(hot(color, 0.8), 1, circleAt(4.8), 10);
  p.stroke(color, 2.4, 6, circleAt(evo ? 7.5 : 8.6));
}

const CLOUD: Path = (c) => {
  c.moveTo(-9.5, -2);
  c.bezierCurveTo(-17, -2, -17, -13, -9, -13.5);
  c.bezierCurveTo(-8, -20, 6, -20, 8, -13.5);
  c.bezierCurveTo(16, -13, 17, -2, 9.5, -2);
  c.closePath();
};

function storm(p: Pen, color: number, evo: boolean): void {
  const ground =
    (x: number, w: number): Path =>
    (c) => {
      c.moveTo(x + w, 17);
      c.ellipse(x, 17, w, 3.4, 0, 0, TAU);
    };
  p.fill(color, 0.3, ground(0, 15));
  trace(p, color, 0.7, 2, ground(0, 15));
  p.fill(color, 0.2, at(CLOUD, 0, -1, evo ? 1.15 : 1));
  p.stroke(color, 2.8, 8, at(CLOUD, 0, -1, evo ? 1.15 : 1));
  p.fill(color, 1, at(BOLT, 1, 7, 10.5), 10);
  if (evo) {
    p.fill(color, 1, at(BOLT, -11, 9, 6.5), 8);
    p.fill(color, 1, at(BOLT, 13, 9, 6.5), 8);
    p.fill(hot(color, 0.8), 1, starAt(1, 17, 4.5, 4, 0.3), 8);
  } else {
    p.fill(color, 1, at(BOLT, -10, 10, 6), 8);
  }
}

// --- Armes : poison ----------------------------------------------------------------------

const ellipseAt =
  (rx: number, ry: number, x = 0, y = 0, rot = 0): Path =>
  (c) => {
    c.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
    c.ellipse(x, y, rx, ry, rot, 0, TAU);
  };

function acidpool(p: Pen, color: number, evo: boolean): void {
  const pools: [number, number, number, number][] = evo
    ? [
        [19, 6.5, 0, 11],
        [9, 3.4, 12, 1],
        [7, 3, -14, 3],
      ]
    : [[18, 6.5, 0, 11]];
  for (const [rx, ry, x, y] of pools) {
    p.fill(color, 0.35, ellipseAt(rx, ry, x, y), 6);
    p.stroke(color, 2.8, 8, ellipseAt(rx, ry, x, y));
  }
  trace(p, color, 0.7, 2, ellipseAt(9, 2.8, 0, 11));
  const bubbles: [number, number, number][] = evo
    ? [
        [-9, 3, 3.2],
        [8, -2, 2.8],
        [-3, -3, 2.2],
        [13, -8, 2],
      ]
    : [
        [-9, 3, 3.2],
        [8, 1, 2.6],
      ];
  for (const [x, y, r] of bubbles) p.stroke(color, 2.2, 5, circleAt(r, x, y));
  emblem(p, 'poison', color, 0, -10, 6.5);
}

function miasma(p: Pen, color: number, evo: boolean): void {
  const n = evo ? 9 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    const r = 5 + (i % 2) * 1.4;
    const R = evo ? 14 : 12.8;
    const x = Math.cos(a) * R;
    const y = Math.sin(a) * R;
    p.fill(color, 0.22, circleAt(r, x, y));
    p.stroke(color, 2.4, 6, circleAt(r, x, y));
  }
  emblem(p, 'poison', color, 0, 0, evo ? 6 : 5.6);
}

const ABDOMEN: Path = ellipseAt(9.5, 5.5, -9, 0);
const THORAX: Path = circleAt(4.6, 2.5, 0);
const HEAD: Path = circleAt(3.4, 9.5, 0);

function wasp(p: Pen, color: number, x: number, y: number, s: number, rot: number): void {
  const wings = (c: Ctx): void => {
    ellipseAt(8.5, 3.6, -1, -8.2, -0.5)(c);
    ellipseAt(8.5, 3.6, -1, 8.2, 0.5)(c);
  };
  p.fill(hot(color, 0.3), 0.3, at(wings, x, y, s, rot));
  p.stroke(color, 1.8, 5, at(wings, x, y, s, rot));
  p.fill(color, 0.85, at(ABDOMEN, x, y, s, rot), 8);
  trace(
    p,
    PALETTE.void,
    0.9,
    2.6 * s,
    at(lines([-12, -5.2, -12, 5.2, -6.5, 5.5, -6.5, -5.5]), x, y, s, rot),
  );
  p.stroke(color, 2.4, 6, at(ABDOMEN, x, y, s, rot));
  p.fill(color, 0.95, at(THORAX, x, y, s, rot), 8);
  p.fill(hot(color, 0.3), 1, at(HEAD, x, y, s, rot));
  p.stroke(color, 2, 5, at(lines([-18.5, 0, -23, 0]), x, y, s, rot));
}

function wasps(p: Pen, color: number, evo: boolean): void {
  const rot = -Math.PI / 4;
  if (!evo) {
    trace(
      p,
      color,
      0.5,
      2,
      (c) => {
        c.moveTo(-21, 4);
        c.bezierCurveTo(-21, 20, -8, 20, -8, 12);
      },
      [3, 3],
    );
    wasp(p, color, 4, -3, 0.9, rot);
    return;
  }
  wasp(p, color, -12, 8, 0.5, rot + 0.5);
  wasp(p, color, 10, 12, 0.5, rot - 0.6);
  wasp(p, color, 4, -4, 1, rot);
}

const SCYTHE_BLADE: Path = (c) => {
  c.moveTo(0, -12);
  c.bezierCurveTo(10, -21, 24, -15, 24, -1);
  c.bezierCurveTo(17, -9, 8, -9, 0, -6);
  c.closePath();
};
const SCYTHE_HANDLE: Path = lines([0, 21, 0, -11]);

function venomscythe(p: Pen, color: number, evo: boolean): void {
  if (!evo) {
    const rot = 0.35;
    p.stroke(color, 3.6, 8, at(SCYTHE_HANDLE, -9, 0, 1, rot));
    p.fill(color, 0.65, at(SCYTHE_BLADE, -9, 0, 1, rot), 8);
    p.stroke(color, 2.8, 8, at(SCYTHE_BLADE, -9, 0, 1, rot));
    emblem(p, 'poison', color, 13, 12, 4.2);
    return;
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    const x = Math.cos(a) * 8;
    const y = Math.sin(a) * 8;
    p.stroke(color, 3.4, 8, at(SCYTHE_HANDLE, x, y, 0.62, a + Math.PI / 2));
    p.fill(color, 0.65, at(SCYTHE_BLADE, x, y, 0.62, a + Math.PI / 2), 8);
    p.stroke(color, 2.8, 8, at(SCYTHE_BLADE, x, y, 0.62, a + Math.PI / 2));
  }
  p.fill(hot(color, 0.7), 1, circleAt(2.6), 6);
}

/** Courbe en S entre deux points (tentacule). */
function sCurve(c: Ctx, x0: number, y0: number, x1: number, y1: number, amp: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  c.moveTo(x0, y0);
  c.bezierCurveTo(
    x0 + dx / 3 + nx * amp,
    y0 + dy / 3 + ny * amp,
    x0 + (2 * dx) / 3 - nx * amp,
    y0 + (2 * dy) / 3 - ny * amp,
    x1,
    y1,
  );
}

function parasite(p: Pen, color: number, evo: boolean): void {
  const nodes: [number, number][] = evo
    ? [
        [-15, 10],
        [-2, -12],
        [14, -4],
        [8, 15],
      ]
    : [
        [-14, 10],
        [1, -12],
        [15, 8],
      ];
  p.stroke(color, 3, 8, (c) => {
    for (let i = 1; i < nodes.length; i++) {
      sCurve(c, nodes[i - 1][0], nodes[i - 1][1], nodes[i][0], nodes[i][1], 6);
    }
    if (evo) sCurve(c, -2, -12, -17, -14, -3);
  });
  for (const [x, y] of nodes) {
    p.fill(color, 0.7, circleAt(5.2, x, y), 8);
    p.stroke(color, 2.2, 5, (c) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + Math.PI / 5;
        c.moveTo(x + Math.cos(a) * 5.2, y + Math.sin(a) * 5.2);
        c.lineTo(x + Math.cos(a) * 8.2, y + Math.sin(a) * 8.2);
      }
    });
    p.fill(hot(color, 0.8), 1, circleAt(1.8, x, y));
  }
}

// --- Armes : arcane ----------------------------------------------------------------------

function runes(p: Pen, color: number, evo: boolean): void {
  const n = evo ? 9 : 3;
  const R = evo ? 17 : 15.5;
  const pos: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    const rr = evo && i % 2 === 1 ? R - 3.5 : R;
    pos.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  if (!evo) trace(p, color, 0.4, 1.8, circleAt(R), [3, 3]);
  trace(p, color, evo ? 0.55 : 0.4, 1.8, (c) => {
    pos.forEach(([x, y], i) => {
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
  });
  for (const [x, y] of pos) {
    if (evo) {
      p.fill(hot(color, 0.6), 1, starAt(x, y, 4.4, 4, 0.32), 8);
    } else {
      p.fill(color, 0.4, circleAt(5.8, x, y), 8);
      p.stroke(color, 2.6, 8, circleAt(5.8, x, y));
      p.fill(hot(color, 0.8), 1, starAt(x, y, 3, 4, 0.4));
    }
  }
  if (evo) p.fill(hot(color, 0.7), 1, starAt(0, 0, 7, 4, 0.32), 10);
  else p.fill(color, 0.9, circleAt(2.6), 6);
}

function prismray(p: Pen, color: number, evo: boolean): void {
  const prism = (c: Ctx): void => {
    poly(c, 3, evo ? 10.5 : 10, -Math.PI / 2);
  };
  p.stroke(hot(color, 0.5), 3.2, 8, lines([-21, 6, -4, 1.5]));
  const fan = evo ? [-0.75, -0.38, 0, 0.38, 0.75] : [-0.55, 0, 0.55];
  p.stroke(color, 3, 9, (c) => {
    for (const a of fan) {
      c.moveTo(6, 0);
      c.lineTo(6 + Math.cos(a) * 15.5, Math.sin(a) * 19);
    }
  });
  p.fill(color, 0.3, prism, 8);
  p.stroke(color, 3, 8, prism);
}

const MISSILE: Path = lines(
  [11, 0, 5, -4.2, -5, -4.2, -9.5, -8, -9.5, -2.2, -12, 0, -9.5, 2.2, -9.5, 8, -5, 4.2, 5, 4.2],
  true,
);
const EXHAUST: Path = lines([-12, -2, -19, 0, -12, 2], true);
const MISSILE_TRAIL: Path = (c) => {
  c.moveTo(-19, 0);
  c.bezierCurveTo(-22, 0, -23, 4, -27, 4);
};

function missiles(p: Pen, color: number, evo: boolean): void {
  const rocket = (x: number, y: number, s: number, rot: number): void => {
    // Sillage courbe : la trajectoire s'infléchit vers la cible.
    if (!evo) trace(p, color, 0.5, 2, at(MISSILE_TRAIL, x, y, s, rot), [2.5, 3]);
    p.fill(hot(color, 0.7), 1, at(EXHAUST, x, y, s, rot), 6);
    p.fill(color, 0.6, at(MISSILE, x, y, s, rot), 6);
    p.stroke(color, 2.4, 6, at(MISSILE, x, y, s, rot));
  };
  const a = -Math.PI / 4;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // Formation en pointe de flèche : (avance, décalage latéral) le long de la direction de tir.
  const formation: [number, number][] = evo
    ? [
        [4, -10],
        [4, 0],
        [4, 10],
        [-8, -5],
        [-8, 5],
      ]
    : [
        [7, 0],
        [0, -9.5],
        [0, 9.5],
      ];
  const s = evo ? 0.64 : 0.8;
  for (const [f, l] of formation) rocket(dx * f - dy * l, dy * f + dx * l, s, a);
  if (evo) {
    p.fill(hot(color, 0.7), 1, starAt(9.5, -9.5, 4.8, 4, 0.32), 8);
    p.fill(hot(color, 0.7), 1, starAt(0, -17, 3.6, 4, 0.32), 8);
  }
}

function sigil(p: Pen, color: number, evo: boolean): void {
  p.stroke(color, 2.8, 8, circleAt(19));
  if (evo) {
    p.stroke(color, 2.4, 6, circleAt(14.5));
    p.stroke(color, 2.2, 6, circleAt(10));
  } else {
    trace(p, color, 0.5, 1.8, circleAt(15.5));
    p.stroke(color, 2.4, 6, (c) => {
      poly(c, 3, 12.5, -Math.PI / 2);
      poly(c, 3, 12.5, Math.PI / 2);
    });
  }
  p.fill(hot(color, 0.7), 1, evo ? starAt(0, 0, 6.5, 6, 0.5) : circleAt(2.8), 8);
}

const TILE = (w: number, h: number): Path => lines([0, -h, w, 0, 0, h, -w, 0], true);

function glyphs(p: Pen, color: number, evo: boolean): void {
  const tile = (x: number, y: number, s: number): void => {
    p.fill(color, 0.3, at(TILE(18, 11), x, y, s), 6);
    p.stroke(color, 3, 8, at(TILE(18, 11), x, y, s));
    trace(p, color, 0.7, 2, at(TILE(9.5, 5.8), x, y, s));
    p.fill(hot(color, 0.8), 1, at(TILE(3.2, 2), x, y, s), 6);
  };
  if (!evo) {
    tile(0, 7, 1);
    p.fill(hot(color, 0.7), 1, starAt(0, -9, 7, 4, 0.32), 10);
    return;
  }
  tile(0, -6, 0.62);
  tile(-11, 9, 0.62);
  tile(11, 9, 0.62);
  p.fill(hot(color, 0.7), 1, starAt(0, 4, 5, 4, 0.32), 10);
}

// --- Armes : vide ------------------------------------------------------------------------

const VOID_SHARD: Path = lines([21, -1, 8, -8, -4, -6.5, -14, 1, -3, 7.5, 9, 5], true);
const VOID_FACETS: Path = lines([21, -1, 3, 0, -14, 1, 3, 0, 8, -8, 3, 0, 9, 5]);
const VOID_SPEAR: Path = lines([24, 0, 6, -5.5, -17, -3, -22, 0, -17, 3, 6, 5.5], true);
const VOID_SPEAR_AXIS: Path = lines([24, 0, -22, 0]);

function voidshard(p: Pen, color: number, evo: boolean): void {
  const shard = (path: Path, facets: Path, x: number, y: number, s: number, rot: number): void => {
    p.fill(deep(color, 0.7), 0.95, at(path, x, y, s, rot), 8);
    p.stroke(color, 2.8, 9, at(path, x, y, s, rot));
    trace(p, hot(color, 0.5), 0.8, 1.6, at(facets, x, y, s, rot));
  };
  const a = -Math.PI / 4;
  if (!evo) {
    shard(VOID_SHARD, VOID_FACETS, 0, 0, 0.9, a);
    emblem(p, 'void', color, -14, 14, 4.5);
    return;
  }
  // Sillage en spirale : la lance aspire tout vers elle.
  trace(p, color, 0.6, 2.6, at(SWIRL, -7, 7, 12));
  shard(VOID_SPEAR, VOID_SPEAR_AXIS, 2, -2, 1, a);
}

function singularity(p: Pen, color: number, evo: boolean): void {
  const hole = (x: number, y: number, r: number): void => {
    p.fill(deep(color, 0.85), 1, circleAt(r, x, y), 6);
    p.stroke(color, 3, 10, circleAt(r + 3.6, x, y));
  };
  // Bras en spirale : la matière est aspirée vers le centre.
  p.stroke(color, 2.6, 7, (c) => {
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * TAU - 0.4;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const a = a0 + t * 1.1;
        const r = 14 + 6.5 * (1 - t);
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    }
  });
  if (evo) {
    hole(-7.5, -3.5, 4.4);
    hole(7.5, 3.5, 4.4);
  } else {
    hole(0, 0, 5.8);
  }
}

function horizon(p: Pen, color: number, evo: boolean): void {
  const rot = -0.35;
  const rings: [number, number][] = evo
    ? [
        [19, 6.5],
        [14, 4.6],
      ]
    : [[19, 6.5]];
  if (evo) p.stroke(color, 2.2, 8, circleAt(20.5));
  else trace(p, color, 0.5, 2.2, circleAt(20.5), [4, 4]);
  for (const [rx, ry] of rings) trace(p, color, 0.55, 3, ellipseAt(rx, ry, 0, 0, rot));
  p.fill(deep(color, 0.85), 1, circleAt(evo ? 8.5 : 7.5), 8);
  p.stroke(color, 2.4, 8, circleAt(evo ? 8.5 : 7.5));
  for (const [rx, ry] of rings) {
    p.stroke(color, 3, 9, (c) => {
      c.moveTo(Math.cos(rot) * rx, Math.sin(rot) * rx);
      c.ellipse(0, 0, rx, ry, rot, 0, Math.PI);
    });
  }
}

function entropyray(p: Pen, color: number, evo: boolean): void {
  const wave =
    (y0: number, ph: number): Path =>
    (c) => {
      for (let i = 0; i <= 26; i++) {
        const x = -20 + i;
        const t = i / 26;
        const y = y0 + 5.5 * (1 - 0.45 * t) * Math.sin(t * TAU * 2.2 + ph);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
    };
  p.stroke(color, 3, 9, wave(evo ? -2.5 : 0, 0));
  if (evo) p.stroke(color, 3, 9, wave(2.5, Math.PI));
  p.fill(hot(color, 0.7), 1, circleAt(2.6, -20, 0), 6);
  const rr = evo ? 8.5 : 7.5;
  p.stroke(color, 2.6, 8, (c) => {
    circle(c, rr, 11, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      c.moveTo(11 + Math.cos(a) * rr, Math.sin(a) * rr);
      c.lineTo(11 + Math.cos(a) * (rr + 3.2), Math.sin(a) * (rr + 3.2));
    }
  });
  p.fill(hot(color, 0.7), 1, circleAt(2.4, 11, 0), 6);
}

function voidlink(p: Pen, color: number, evo: boolean): void {
  const nodes: [number, number][] = evo
    ? [
        [-16, 7],
        [-6, -7],
        [5, 7],
        [15, -7],
      ]
    : [
        [-15, 5],
        [0, -6],
        [15, 5],
      ];
  p.stroke(color, 2.8, 8, (c) => {
    for (let i = 1; i < nodes.length; i++) {
      c.moveTo(nodes[i - 1][0], nodes[i - 1][1]);
      c.lineTo(nodes[i][0], nodes[i][1]);
    }
    if (evo) {
      c.moveTo(5, 7);
      c.lineTo(10, 17);
    }
  });
  const vnode = (x: number, y: number, r: number): void => {
    p.fill(deep(color, 0.7), 1, circleAt(r, x, y));
    p.stroke(color, 2.6, 8, circleAt(r, x, y));
    p.fill(hot(color, 0.7), 1, circleAt(r * 0.33, x, y));
  };
  for (const [x, y] of nodes) vnode(x, y, 5.4);
  if (evo) vnode(10, 17, 3.6);
}

// --- Passifs -----------------------------------------------------------------------------

type PassiveGlyph = (p: Pen, color: number) => void;

const HEART: Path = (c) => {
  c.moveTo(0, 13);
  c.bezierCurveTo(-18, 0, -12, -16, 0, -6);
  c.bezierCurveTo(12, -16, 18, 0, 0, 13);
  c.closePath();
};

function vitality(p: Pen, color: number): void {
  p.fill(color, 0.4, at(HEART, 0, 1, 1.25), 10);
  p.stroke(color, 3.2, 9, at(HEART, 0, 1, 1.25));
  trace(p, PALETTE.white, 0.95, 2.4, lines([-14, 1, -7, 1, -4, -6, 0, 8, 4, -3, 6, 1, 14, 1]));
}

const BOOT: Path = (c) => {
  c.moveTo(-7, -16);
  c.lineTo(5, -16);
  c.lineTo(5, -4);
  c.bezierCurveTo(5, 0, 11, 1, 16, 4);
  c.bezierCurveTo(20, 6, 21, 8, 21, 10);
  c.lineTo(21, 13);
  c.lineTo(-7, 13);
  c.closePath();
};

function swiftness(p: Pen, color: number): void {
  p.stroke(color, 2.8, 7, (c) => {
    c.moveTo(-14, -8);
    c.lineTo(-23, -8);
    c.moveTo(-14, 0);
    c.lineTo(-21, 0);
    c.moveTo(-14, 8);
    c.lineTo(-23, 8);
  });
  p.fill(color, 0.4, at(BOOT, -3, 0, 0.95), 8);
  p.stroke(color, 3, 8, at(BOOT, -3, 0, 0.95));
  trace(p, hot(color), 0.9, 2.2, lines([-9.5, 8, 17, 8]));
}

function magnet(p: Pen, color: number): void {
  const u: Path = (c) => {
    c.moveTo(-10, -9);
    c.lineTo(-10, 2);
    c.arc(0, 2, 10, Math.PI, 0, true);
    c.lineTo(10, -9);
  };
  p.stroke(color, 6.5, 9, u);
  p.stroke(hot(color, 0.7), 6.5, 6, (c) => {
    c.moveTo(-10, -9);
    c.lineTo(-10, -17);
    c.moveTo(10, -9);
    c.lineTo(10, -17);
  });
  for (const [x, y, r] of [
    [0, -14, 2],
    [-3.5, -6, 1.7],
    [3.5, -6, 1.7],
  ]) {
    p.fill(hot(color, 0.8), 1, circleAt(r, x, y), 6);
  }
}

function capacitor(p: Pen, color: number): void {
  p.stroke(color, 4.4, 8, lines([-7, -14, -7, 14]));
  p.stroke(color, 4.4, 8, lines([7, -14, 7, 14]));
  p.stroke(color, 2.8, 6, (c) => {
    c.moveTo(-22, 0);
    c.lineTo(-7, 0);
    c.moveTo(7, 0);
    c.lineTo(22, 0);
  });
  p.fill(hot(color, 0.7), 1, at(BOLT, 0, 0, 7), 8);
}

function amplifier(p: Pen, color: number): void {
  const head = lines([-9.5, -3, 0, -17, 9.5, -3], true);
  p.stroke(color, 4.4, 9, lines([0, 16, 0, -3]));
  p.fill(color, 0.85, head, 8);
  p.stroke(color, 2.6, 8, head);
  for (const r of [12, 18]) {
    p.stroke(color, r > 12 ? 2.4 : 2.8, 6, at(arcPath(r, -0.6, 0.6), 0, 5, 1));
    p.stroke(color, r > 12 ? 2.4 : 2.8, 6, at(arcPath(r, Math.PI - 0.6, Math.PI + 0.6), 0, 5, 1));
  }
}

function lens(p: Pen, color: number): void {
  p.fill(color, 0.2, circleAt(11.5, -3, -3), 6);
  p.stroke(color, 3.6, 9, circleAt(11.5, -3, -3));
  p.stroke(color, 5.6, 8, lines([5.5, 5.5, 17.5, 17.5]));
  trace(p, hot(color, 0.8), 0.95, 2.4, at(arcPath(7, Math.PI * 1.05, Math.PI * 1.45), -3, -3, 1));
}

const SHIELD: Path = (c) => {
  c.moveTo(0, -18);
  c.bezierCurveTo(5, -14, 10, -12, 15, -12);
  c.lineTo(15, -1);
  c.bezierCurveTo(15, 9, 8, 15, 0, 19);
  c.bezierCurveTo(-8, 15, -15, 9, -15, -1);
  c.lineTo(-15, -12);
  c.bezierCurveTo(-10, -12, -5, -14, 0, -18);
  c.closePath();
};

function plating(p: Pen, color: number): void {
  p.fill(color, 0.2, SHIELD, 6);
  p.stroke(color, 3.2, 9, SHIELD);
  p.fill(color, 0.5, (c) => {
    c.moveTo(0, -12.5);
    c.lineTo(-10.5, -8.5);
    c.lineTo(-10.5, -1);
    c.bezierCurveTo(-10.5, 6, -5.5, 11, 0, 14);
    c.closePath();
  });
  trace(p, hot(color), 0.9, 2, lines([0, -12.5, 0, 14]));
}

function nanites(p: Pen, color: number): void {
  const cells: [number, number][] = [
    [0, 0],
    [-10, 0],
    [10, 0],
    [0, -10],
    [0, 10],
  ];
  for (const [x, y] of cells) {
    p.fill(color, 0.5, circleAt(4.8, x, y), 8);
    p.stroke(color, 2.6, 7, circleAt(4.8, x, y));
  }
  for (const [x, y] of [
    [-15, -15],
    [15, -15],
    [-15, 15],
    [15, 15],
  ]) {
    p.fill(hot(color, 0.7), 1, circleAt(1.9, x, y), 5);
  }
}

function scope(p: Pen, color: number): void {
  p.stroke(color, 2.8, 8, circleAt(11.5));
  p.stroke(color, 2.8, 8, (c) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      c.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      c.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
    }
  });
  p.fill(hot(color, 0.7), 1, circleAt(2.4), 6);
}

function overclock(p: Pen, color: number): void {
  p.fill(color, 0.3, starAt(0, -1, 21, 8, 0.58), 8);
  p.stroke(color, 4.4, 9, lines([-12, -1, 0, -13, 12, -1]));
  p.stroke(color, 4.4, 9, lines([-12, 11, 0, -1, 12, 11]));
}

function accelerator(p: Pen, color: number): void {
  const rot = -Math.PI / 4;
  const head = at(lines([21, 0, 7, -7.5, 7, 7.5], true), 0, 0, 1, rot);
  p.stroke(color, 4, 9, at(lines([7, 0, -8, 0]), 0, 0, 1, rot));
  p.fill(color, 0.85, head, 8);
  p.stroke(color, 2.6, 8, head);
  const streaks: Path = (c) => {
    c.moveTo(-2, -8);
    c.lineTo(-14, -8);
    c.moveTo(-2, 8);
    c.lineTo(-14, 8);
    c.moveTo(-14, 0);
    c.lineTo(-21, 0);
  };
  p.stroke(color, 2.6, 6, at(streaks, 0, 0, 1, rot));
}

function persistence(p: Pen, color: number): void {
  const glass = lines([-10, -15, 10, -15, 1.6, 0, 10, 15, -10, 15, -1.6, 0], true);
  p.fill(color, 0.15, glass);
  p.stroke(color, 3, 8, glass);
  p.stroke(color, 3.6, 8, (c) => {
    c.moveTo(-13, -17);
    c.lineTo(13, -17);
    c.moveTo(-13, 17);
    c.lineTo(13, 17);
  });
  p.fill(hot(color, 0.5), 0.9, lines([-7, 13, 7, 13, 0, 5], true));
  p.fill(hot(color, 0.5), 0.7, lines([-5, -12, 5, -12, 0, -6], true));
  trace(p, hot(color, 0.7), 0.9, 1.6, lines([0, -3, 0, 5]));
}

function multiplier(p: Pen, color: number): void {
  const back = lines([-15, -15, 3, -15, 3, 3, -15, 3], true);
  const front = lines([-3, -3, 15, -3, 15, 15, -3, 15], true);
  p.fill(color, 0.25, back);
  p.stroke(color, 3, 8, back);
  p.fill(deep(color, 0.8), 1, front);
  p.fill(color, 0.35, front, 8);
  p.stroke(color, 3, 9, front);
}

const LEAF: Path = (c) => {
  c.moveTo(0, 0);
  c.bezierCurveTo(-0.15, -0.25, -1, -0.55, -1, -1.05);
  c.bezierCurveTo(-1, -1.6, -0.2, -1.6, 0, -1.05);
  c.bezierCurveTo(0.2, -1.6, 1, -1.6, 1, -1.05);
  c.bezierCurveTo(1, -0.55, 0.15, -0.25, 0, 0);
  c.closePath();
};

function clover(p: Pen, color: number): void {
  p.stroke(color, 2.8, 6, (c) => {
    c.moveTo(1, 3);
    c.quadraticCurveTo(4, 12, -1, 20);
  });
  for (let i = 0; i < 4; i++) {
    const rot = (i / 4) * TAU + Math.PI / 4 + Math.PI / 2 - Math.PI / 2;
    const leaf = at(LEAF, 0, -1, 9, rot);
    p.fill(color, 0.5, leaf, 8);
    p.stroke(color, 2.6, 7, leaf);
  }
}

/** Feuille pointue de la base (bx, by) à la pointe (tx, ty). */
const leaf =
  (bx: number, by: number, tx: number, ty: number, w: number): Path =>
  (c) => {
    const mx = (bx + tx) / 2;
    const my = (by + ty) / 2;
    const len = Math.hypot(tx - bx, ty - by) || 1;
    const nx = (-(ty - by) / len) * w;
    const ny = ((tx - bx) / len) * w;
    c.moveTo(bx, by);
    c.quadraticCurveTo(mx + nx, my + ny, tx, ty);
    c.quadraticCurveTo(mx - nx, my - ny, bx, by);
    c.closePath();
  };

function growth(p: Pen, color: number): void {
  p.stroke(color, 3, 8, (c) => {
    c.moveTo(0, 17);
    c.quadraticCurveTo(-2, 8, 0, 0);
  });
  for (const l of [leaf(0, 6, -16, -6, 6), leaf(0, 0, 16, -13, 6.5)]) {
    p.fill(color, 0.5, l, 8);
    p.stroke(color, 2.6, 7, l);
  }
  trace(p, color, 0.6, 2, lines([-12, 17.5, 12, 17.5]));
}

function greed(p: Pen, color: number): void {
  p.fill(color, 0.3, circleAt(15.5), 8);
  p.stroke(color, 3.4, 9, circleAt(15.5));
  trace(p, color, 0.65, 1.8, circleAt(10.5));
  const gem = lines([0, -7.5, 5.5, 0, 0, 7.5, -5.5, 0], true);
  p.fill(hot(color, 0.6), 1, gem, 8);
}

function phase(p: Pen, color: number): void {
  const chevron = (x: number): Path => lines([x - 7, -12, x + 5, 0, x - 7, 12]);
  trace(p, color, 0.3, 4, chevron(-17));
  trace(p, color, 0.6, 4, chevron(-6));
  p.stroke(color, 4.4, 9, chevron(9));
}

function focus(p: Pen, color: number): void {
  p.stroke(color, 2.6, 8, circleAt(15));
  p.stroke(color, 2.6, 8, circleAt(8.5));
  p.fill(hot(color, 0.6), 1, circleAt(3.4), 8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    p.fill(
      color,
      0.9,
      at(lines([-3.6, 0, 3, -4, 3, 4], true), Math.cos(a) * 20.5, Math.sin(a) * 20.5, 1, a),
      6,
    );
  }
}

function resonator(p: Pen, color: number): void {
  trace(p, color, 0.4, 2, circleAt(20.5));
  trace(p, color, 0.55, 2, circleAt(14));
  p.stroke(color, 3.2, 9, (c) => {
    for (let i = 0; i <= 40; i++) {
      const x = -19 + i * 0.95;
      const t = i / 40;
      const y = (3 + 10 * t) * Math.sin(t * TAU * 2);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  });
}

/** Noyau élémentaire : atome (deux orbites, deux électrons) et emblème de l'élément. */
function core(p: Pen, color: number, el: ElementId): void {
  const orbits = [0.62, -0.62];
  for (const rot of orbits) p.stroke(color, 2.2, 6, ellipseAt(19.5, 7.2, 0, 0, rot));
  p.fill(deep(color, 0.8), 0.96, circleAt(11.2));
  p.stroke(color, 2.6, 8, circleAt(11.2));
  emblem(p, el, color, 0, 0, 7.4);
  for (const [rot, t] of [
    [0.62, 0.35],
    [-0.62, Math.PI + 0.35],
  ]) {
    const ex = Math.cos(t) * 19.5;
    const ey = Math.sin(t) * 7.2;
    const x = ex * Math.cos(rot) - ey * Math.sin(rot);
    const y = ex * Math.sin(rot) + ey * Math.cos(rot);
    p.fill(hot(color, 0.8), 1, circleAt(2.6, x, y), 8);
  }
}

// --- Récompenses -------------------------------------------------------------------------

function heal(p: Pen, color: number): void {
  const cross = lines(
    [
      -5.5, -16, 5.5, -16, 5.5, -5.5, 16, -5.5, 16, 5.5, 5.5, 5.5, 5.5, 16, -5.5, 16, -5.5, 5.5,
      -16, 5.5, -16, -5.5, -5.5, -5.5,
    ],
    true,
  );
  p.fill(color, 0.55, cross, 12);
  p.stroke(color, 3, 9, cross);
  p.fill(hot(color, 0.8), 1, starAt(14, -14, 3.6, 4, 0.35), 6);
}

function gold(p: Pen, color: number): void {
  const gem = lines([-8, -12, 8, -12, 16, -3, 0, 17, -16, -3], true);
  p.fill(color, 0.35, gem, 10);
  p.stroke(color, 3.2, 9, gem);
  trace(
    p,
    hot(color, 0.7),
    0.85,
    1.8,
    lines([-16, -3, 16, -3, -4, -3, 0, 17, 4, -3, 0, 17, -8, -12, -4, -3, 8, -12, 4, -3]),
  );
  p.fill(hot(color, 0.8), 1, starAt(16, -16, 4, 4, 0.32), 8);
}

// --- Registre ----------------------------------------------------------------------------

const WEAPON_GLYPHS: Partial<Record<string, Glyph>> = {
  ember,
  flamewheel,
  brazier,
  firemine,
  phoenix,
  frost,
  icelance,
  glacialwave,
  blizzard,
  frostblade,
  arc,
  railgun,
  voltdisc,
  discharge,
  storm,
  acidpool,
  miasma,
  wasps,
  venomscythe,
  parasite,
  runes,
  prismray,
  missiles,
  sigil,
  glyphs,
  voidshard,
  singularity,
  horizon,
  entropyray,
  voidlink,
};

const PASSIVE_GLYPHS: Partial<Record<string, PassiveGlyph>> = {
  vitality,
  swiftness,
  magnet,
  capacitor,
  amplifier,
  lens,
  plating,
  nanites,
  scope,
  overclock,
  accelerator,
  persistence,
  multiplier,
  clover,
  growth,
  greed,
  phase,
  focus,
  resonator,
  pyro: (p, color) => {
    core(p, color, 'fire');
  },
  cryo: (p, color) => {
    core(p, color, 'frost');
  },
  electro: (p, color) => {
    core(p, color, 'lightning');
  },
  toxo: (p, color) => {
    core(p, color, 'poison');
  },
  arcano: (p, color) => {
    core(p, color, 'arcane');
  },
  entropo: (p, color) => {
    core(p, color, 'void');
  },
  heal,
  gold,
};

/** id d'évolution → id de l'arme de base. */
const EVOLUTION_BASE = new Map(WEAPONS.map((w) => [w.evolution.id, w.id]));

/** Cadre hexagonal ; les évolutions ajoutent un second cadre doré et une étoile dorée. */
function frame(p: Pen, color: number, evo: boolean): void {
  p.fill(color, 0.12, hexPath(27));
  p.stroke(color, 1.6, 6, hexPath(27));
  if (!evo) return;
  p.stroke(GOLD, 1.8, 8, hexPath(23));
  p.fill(PALETTE.void, 0.92, circleAt(6.4, 12, -20));
  p.fill(GOLD, 1, starAt(12, -20, 5.6), 10);
}

/** Pictogramme de repli : croix. */
function fallback(p: Pen, color: number): void {
  p.stroke(color, 3.4, 8, lines([0, -12, 0, 12, 0, 0, -12, 0, 12, 0]));
}

export function drawIcon(p: Pen, id: string, color: number): void {
  const baseId = EVOLUTION_BASE.get(id);
  const evo = baseId !== undefined;
  frame(p, color, evo);
  const weapon = WEAPON_GLYPHS[baseId ?? id];
  if (weapon) {
    if (!evo) {
      weapon(p, color, false);
      return;
    }
    const q = new GlowPen(p, 1.5);
    q.radial(color, 25, 0.32, 0);
    p.ctx.save();
    p.ctx.scale(0.9, 0.9);
    weapon(q, color, true);
    p.ctx.restore();
    return;
  }
  const passive = PASSIVE_GLYPHS[id];
  (passive ?? fallback)(p, color);
}

/** Couleur d'une icône : élément de l'arme (et de son évolution) ou couleur du passif. */
export function iconColor(id: string): number {
  const w = WEAPONS.find((x) => x.id === id || x.evolution.id === id);
  if (w) return colorOf(w.color);
  const p = PASSIVES.find((x) => x.id === id);
  if (p) return colorOf(p.color);
  return id === 'heal' ? PALETTE.magenta : PALETTE.yellow;
}
