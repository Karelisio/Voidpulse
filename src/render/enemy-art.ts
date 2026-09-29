/**
 * Sprites d'ennemis dessinés en Canvas2D (vectoriel néon) : un dessin propre à chaque
 * identifiant de config/enemies.json, plus un dessin générique par comportement en filet de
 * sécurité. Repère : origine au centre du sprite, unités monde, l'AVANT de l'ennemi est vers +x
 * (le sprite est tourné vers sa direction de déplacement). Tout, halo compris, tient dans la
 * demi-largeur 1,5 × r + 8 de la cellule d'atlas. Seul le crayon (Pen) pose de la couleur : le
 * même dessin est rejoué en « mode blanc » pour le flash de coup.
 */
import { colorOf, type EnemyDef } from '../content/data';
import { PALETTE, mix } from './palette';
import { circle, poly, type Ctx, type Pen } from './pen';

type Path = (c: Ctx) => void;

const TAU = Math.PI * 2;

const hot = (color: number, t = 0.55): number => mix(color, PALETTE.white, t);
const deep = (color: number, t = 0.6): number => mix(color, PALETTE.void, t);

// --- Outils de tracé (coordonnées en fractions du rayon r) ---------------------------------

/** Polygone fermé : coordonnées à plat x0, y0, x1, y1… (s = -1 : symétrique en y). */
const shape =
  (r: number, k: number[], s = 1): Path =>
  (c) => {
    c.moveTo(k[0] * r, k[1] * r * s);
    for (let i = 2; i < k.length; i += 2) c.lineTo(k[i] * r, k[i + 1] * r * s);
    c.closePath();
  };

/** Ligne brisée ouverte (s = -1 : symétrique en y). */
const line =
  (r: number, k: number[], s = 1): Path =>
  (c) => {
    c.moveTo(k[0] * r, k[1] * r * s);
    for (let i = 2; i < k.length; i += 2) c.lineTo(k[i] * r, k[i + 1] * r * s);
  };

/** Segments indépendants : x0, y0, x1, y1 par segment (s = -1 : symétrique en y). */
const segs =
  (r: number, k: number[], s = 1): Path =>
  (c) => {
    for (let i = 0; i < k.length; i += 4) {
      c.moveTo(k[i] * r, k[i + 1] * r * s);
      c.lineTo(k[i + 2] * r, k[i + 3] * r * s);
    }
  };

/** Disque de rayon k × r centré en (x, y) × r. */
const disc =
  (r: number, k: number, x = 0, y = 0): Path =>
  (c) => {
    circle(c, k * r, x * r, y * r);
  };

/** Ellipse de demi-axes (rx, ry) × r centrée en (x, y) × r, inclinée de rot. */
const oval =
  (r: number, rx: number, ry: number, x = 0, y = 0, rot = 0): Path =>
  (c) => {
    c.moveTo(x * r + rx * r * Math.cos(rot), y * r + rx * r * Math.sin(rot));
    c.ellipse(x * r, y * r, rx * r, ry * r, rot, 0, TAU);
  };

/** Polygone régulier de n côtés, rayon k × r, centré en (x, y) × r. */
const ngon =
  (r: number, n: number, k: number, rot = 0, x = 0, y = 0): Path =>
  (c) => {
    c.save();
    c.translate(x * r, y * r);
    poly(c, n, k * r, rot);
    c.restore();
  };

/** Tracé exécuté dans un repère décalé de (x, y) × r puis tourné de rot. */
const local =
  (r: number, x: number, y: number, rot: number, path: Path): Path =>
  (c) => {
    c.save();
    c.translate(x * r, y * r);
    c.rotate(rot);
    path(c);
    c.restore();
  };

/**
 * Contour lisse fermé : point de départ puis segments en fractions de r (échelle k, s = -1 pour
 * la symétrique en y) : 2 valeurs = droite, 4 = courbe quadratique, 6 = courbe de Bézier cubique.
 */
const smooth =
  (r: number, start: number[], curves: number[][], k = 1, s = 1): Path =>
  (c) => {
    const u = r * k;
    c.moveTo(start[0] * u, start[1] * u * s);
    for (const q of curves) {
      if (q.length === 2) c.lineTo(q[0] * u, q[1] * u * s);
      else if (q.length === 4) c.quadraticCurveTo(q[0] * u, q[1] * u * s, q[2] * u, q[3] * u * s);
      else c.bezierCurveTo(q[0] * u, q[1] * u * s, q[2] * u, q[3] * u * s, q[4] * u, q[5] * u * s);
    }
    c.closePath();
  };

/** Fissure en zigzag le long de l'angle a, du rayon r0 au rayon r1 (en fractions de r). */
const crack =
  (r: number, a: number, r0: number, r1: number, n = 4, amp = 0.09): Path =>
  (c) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i <= n; i++) {
      const d = r0 + ((r1 - r0) * i) / n;
      const o = i === 0 ? 0 : i % 2 ? amp : -amp;
      const x = (ca * d - sa * o) * r;
      const y = (sa * d + ca * o) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  };

/** Corps néon : remplissage translucide + contour lumineux. */
const solid = (p: Pen, color: number, path: Path, alpha = 0.25, width = 2.2, glow = 10): void => {
  p.fill(color, alpha, path);
  p.stroke(color, width, glow, path);
};

/** Point lumineux blanc (œil, cœur, reflet). */
const spark = (p: Pen, x: number, y: number, rad: number, glow = 6): void => {
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      circle(c, rad, x, y);
    },
    glow,
  );
};

/** Trait fin sans halo, à opacité réglable (fantômes, nervures, détails secondaires). */
const trace = (
  p: Pen,
  color: number,
  alpha: number,
  width: number,
  path: Path,
  dash?: number[],
): void => {
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
};

// --- Nuées : petits, simples, organiques ---------------------------------------------------

/** Acarien : disque à six pattes et deux yeux vers +x (dessin d'origine). */
function mite(p: Pen, r: number, col: number): void {
  const body = disc(r, 0.72);
  p.fill(col, 0.28, body);
  p.stroke(col, 2, 8, body);
  p.stroke(col, 1.6, 6, (c) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      c.moveTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
      c.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
    }
  });
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, 1.6, r * 0.3, -r * 0.25);
    circle(c, 1.6, r * 0.3, r * 0.25);
  });
}

/** Éclat de verre : tesson triangulaire irrégulier, pointe vers +x, arête interne claire. */
function shardling(p: Pen, r: number, col: number): void {
  const outline = shape(
    r,
    [1.15, 0.05, 0.25, -0.5, -0.4, -0.95, -0.55, -0.15, -0.95, 0.4, -0.05, 0.64],
  );
  p.fill(col, 0.18, outline);
  p.fill(col, 0.38, shape(r, [1.15, 0.05, -0.3, 0.02, -0.95, 0.4, -0.05, 0.64]));
  p.stroke(col, 2.3, 8, outline);
  trace(p, PALETTE.white, 0.9, 1.2, line(r, [1.15, 0.05, -0.3, 0.02, -0.4, -0.95]));
  trace(p, PALETTE.white, 0.5, 1, line(r, [-0.3, 0.02, -0.95, 0.4]));
  spark(p, r * 0.32, -r * 0.3, r * 0.1, 4);
}

/** Anguille : corps en S le long de l'axe, tête vers +x, nageoire pectorale, queue en fourche. */
function eel(p: Pen, r: number, col: number): void {
  const N = 32;
  const spine = (t: number): [number, number] => [
    r * (1.0 - 2.05 * t),
    Math.sin(t * TAU * 1.4 + 0.2) * r * 0.4 * (0.3 + 0.7 * t),
  ];
  const half = (t: number): number => r * (0.06 + 0.26 * (1 - 0.7 * t)) * Math.min(1, 0.6 + t * 8);
  const edge = (t: number, side: number, extra = 0): [number, number] => {
    const [x0, y0] = spine(t - 0.01);
    const [x1, y1] = spine(t + 0.01);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const [x, y] = spine(t);
    const w = half(t) + extra;
    return [x + (-(y1 - y0) / len) * w * side, y + ((x1 - x0) / len) * w * side];
  };
  const hull: Path = (c) => {
    for (let i = 0; i <= N; i++) {
      const [x, y] = edge(i / N, 1);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    for (let i = N; i >= 0; i--) {
      const [x, y] = edge(i / N, -1);
      c.lineTo(x, y);
    }
    c.closePath();
  };
  // Nageoire pectorale (triangle sous la tête) et nageoire caudale en fourche.
  const pec: Path = (c) => {
    const a = edge(0.2, -1);
    const b = edge(0.3, -1, r * 0.3);
    const d = edge(0.36, -1);
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.lineTo(d[0], d[1]);
    c.closePath();
  };
  const tail: Path = (c) => {
    const [x, y] = spine(0.96);
    const [x2, y2] = spine(1.0);
    c.moveTo(x, y);
    c.lineTo(x2 - r * 0.08, y2 - r * 0.2);
    c.moveTo(x, y);
    c.lineTo(x2 - r * 0.08, y2 + r * 0.2);
  };
  p.fill(col, 0.3, pec);
  p.stroke(col, 1.4, 4, pec);
  p.stroke(col, 1.5, 4, tail);
  solid(p, col, hull, 0.3, 2.2, 8);
  const eye = edge(0.06, 1, -r * 0.08);
  spark(p, eye[0], eye[1], r * 0.11, 4);
}

/** Chauve-souris de braise : ailes festonnées déployées, petit corps incandescent, oreilles vers +x. */
function emberbat(p: Pen, r: number, col: number): void {
  for (const s of [-1, 1]) {
    const wing = smooth(
      r,
      [0.28, 0.15],
      [
        [0.32, 0.78, -0.05, 1.16],
        [-0.2, 0.86, -0.5, 0.97],
        [-0.62, 0.7, -0.92, 0.64],
        [-0.72, 0.38, -0.35, 0.12],
      ],
      1,
      s,
    );
    p.fill(col, 0.32, wing);
    p.stroke(col, 1.7, 6, wing);
    trace(
      p,
      col,
      0.7,
      1.1,
      segs(r, [0.22, 0.2, -0.05, 1.16, 0.1, 0.25, -0.5, 0.97, 0, 0.2, -0.92, 0.64], s),
    );
    p.stroke(col, 1.4, 4, shape(r, [0.42, 0.12, 0.64, 0.38, 0.66, 0.06], s));
  }
  p.fill(PALETTE.yellow, 0.8, oval(r, 0.42, 0.28, 0.02), 6);
  p.stroke(col, 1.7, 5, oval(r, 0.42, 0.28, 0.02));
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, 1.1, r * 0.3, -r * 0.11);
    circle(c, 1.1, r * 0.3, r * 0.11);
  });
}

/** Drone : quadrirotor en X, œil central décalé vers l'avant. */
function drone(p: Pen, r: number, col: number): void {
  const spots = [
    [0.62, -0.62],
    [0.62, 0.62],
    [-0.62, -0.62],
    [-0.62, 0.62],
  ];
  p.stroke(
    col,
    1.6,
    5,
    segs(r, [0, 0, 0.62, -0.62, 0, 0, 0.62, 0.62, 0, 0, -0.62, -0.62, 0, 0, -0.62, 0.62]),
  );
  for (const [x, y] of spots) {
    p.fill(col, 0.18, disc(r, 0.3, x, y));
    p.stroke(col, 1.4, 5, disc(r, 0.3, x, y));
  }
  solid(p, col, disc(r, 0.4), 0.5, 1.8, 6);
  p.stroke(col, 1.4, 4, shape(r, [0.66, 0, 0.5, -0.12, 0.5, 0.12]));
  spark(p, r * 0.1, 0, r * 0.19, 6);
}

/** Moustique : ailes fines rabattues vers l'arrière, abdomen rougeâtre, trompe vers +x. */
function mosquito(p: Pen, r: number, col: number): void {
  for (const s of [-1, 1]) {
    const wing = oval(r, 0.56, 0.17, -0.34, s * 0.55, -s * 0.85);
    p.fill(col, 0.24, wing);
    p.stroke(col, 1.4, 4, wing);
    trace(p, col, 0.9, 1.1, line(r, [0.15, 0.12, 0.4, 0.55, 0.62, 0.78], s));
    trace(p, col, 0.9, 1.1, line(r, [0.05, 0.12, 0.05, 0.6, -0.1, 0.86], s));
  }
  p.fill(PALETTE.red, 0.45, oval(r, 0.52, 0.21, -0.6));
  p.stroke(col, 1.8, 5, oval(r, 0.52, 0.21, -0.6));
  solid(p, col, disc(r, 0.28, 0.1), 0.4, 2, 5);
  solid(p, col, disc(r, 0.19, 0.5), 0.4, 1.8, 5);
  p.stroke(col, 1.5, 4, line(r, [0.66, 0, 1.1, 0]));
  spark(p, r * 0.54, -r * 0.06, r * 0.1, 4);
}

/** Crapaud : corps trapu, grosses pattes arrière repliées, yeux saillants vers +x. */
function toad(p: Pen, r: number, col: number): void {
  for (const s of [-1, 1]) {
    // Pattes arrière repliées, pattes avant courtes.
    p.stroke(col, 2.2, 6, line(r, [-0.25, 0.5, -0.78, 0.84, -0.4, 0.98, 0.0, 1.02], s));
    p.stroke(col, 1.8, 5, line(r, [0.4, 0.55, 0.62, 0.84, 0.8, 0.88], s));
  }
  solid(p, col, oval(r, 0.86, 0.68), 0.26, 2.3, 8);
  for (const s of [-1, 1]) {
    p.fill(col, 0.45, disc(r, 0.24, 0.55, s * 0.4));
    p.stroke(col, 1.6, 5, disc(r, 0.24, 0.55, s * 0.4));
    spark(p, r * 0.62, s * r * 0.4, r * 0.1, 4);
  }
  p.fill(hot(col, 0.4), 0.55, (c) => {
    circle(c, r * 0.07, -r * 0.2, -r * 0.2);
    circle(c, r * 0.07, -r * 0.35, r * 0.15);
    circle(c, r * 0.07, -r * 0.05, r * 0.28);
  });
}

/** Feu follet : goutte de flamme à trois langues vers l'arrière, cœur blanc. */
function wisp(p: Pen, r: number, col: number): void {
  const flame = smooth(
    r,
    [0.95, 0],
    [
      [0.95, -0.35, 0.75, -0.7, 0.15, -0.7],
      [-0.3, -0.7, -0.55, -0.6, -1.0, -0.5],
      [-0.6, -0.3, -0.52, -0.15],
      [-0.9, -0.08, -1.18, 0.02],
      [-0.85, 0.14, -0.52, 0.16],
      [-0.58, 0.32, -1.0, 0.52],
      [-0.55, 0.6, -0.3, 0.7, 0.15, 0.7],
      [0.75, 0.7, 0.95, 0.35, 0.95, 0],
    ],
  );
  p.fill(col, 0.26, flame);
  p.stroke(col, 1.8, 8, flame);
  const c = p.ctx;
  c.save();
  c.translate(r * 0.22, 0);
  p.radial(hot(col, 0.5), r * 0.62, 0.7, 0);
  c.restore();
  spark(p, r * 0.22, 0, r * 0.26, 8);
}

// --- Tanks : massifs, contours épais, plaques et noyau --------------------------------------

/** Mastodonte : hexagones emboîtés, noyau et défenses jaunes vers +x (dessin d'origine). */
function brute(p: Pen, r: number, col: number): void {
  p.fill(col, 0.22, ngon(r, 6, 1));
  p.stroke(col, 2.8, 12, ngon(r, 6, 1));
  p.fill(mix(col, 0x000000, 0.4), 0.55, ngon(r, 6, 0.55));
  p.stroke(col, 1.8, 6, ngon(r, 6, 0.55));
  trace(p, col, 0.5, 1.2, (c) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      c.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  });
  p.stroke(PALETTE.yellow, 2, 8, segs(r, [0.55, -0.45, 1.05, -0.7, 0.55, 0.45, 1.05, 0.7]));
  spark(p, 0, 0, r * 0.11, 6);
}

/** Golem de verre : amas de prismes hexagonaux fêlés, œil dans le cristal de tête (avant). */
function glassgolem(p: Pen, r: number, col: number): void {
  // Amas de prismes hexagonaux : un cristal central et six voisins de tailles irrégulières.
  const sizes = [0.42, 0.37, 0.4, 0.35, 0.4, 0.37];
  const alphas = [0.34, 0.16, 0.22, 0.14, 0.22, 0.18];
  sizes.forEach((s, i) => {
    const a = (i / 6) * TAU;
    const hex = ngon(
      r,
      6,
      s,
      Math.PI / 6 + (i % 2 ? 0.12 : -0.1),
      Math.cos(a) * 0.78,
      Math.sin(a) * 0.78,
    );
    p.fill(col, alphas[i], hex);
    p.stroke(col, i === 0 ? 3 : 2.4, 9, hex);
  });
  const core = ngon(r, 6, 0.46, Math.PI / 6);
  p.fill(col, 0.3, core);
  p.stroke(col, 3, 12, core);
  const white = PALETTE.white;
  trace(p, white, 0.9, 1.3, line(r, [-0.34, -0.3, -0.12, -0.08, -0.24, 0.14, 0.04, 0.34]));
  trace(p, white, 0.8, 1.2, crack(r, 2.1, 0.5, 1.1, 3, 0.07));
  trace(p, white, 0.8, 1.2, crack(r, 5.2, 0.5, 1.05, 3, 0.07));
  // Œil lumineux dans le cristal de tête (avant) + éclat au cœur.
  spark(p, r * 0.8, 0, r * 0.1, 7);
  p.fill(hot(col, 0.7), 0.9, disc(r, 0.08, 0.02));
}

/** Limace de magma : corps allongé fissuré de lave, deux yeux pédonculés vers +x. */
function magmaslug(p: Pen, r: number, col: number): void {
  const slug = (k: number): Path =>
    smooth(
      r,
      [1.05, 0],
      [
        [1.05, -0.22, 0.92, -0.34, 0.72, -0.4],
        [0.55, -0.46, 0.5, -0.72, 0.05, -0.74],
        [-0.5, -0.76, -0.95, -0.35, -1.2, 0],
        [-0.95, 0.35, -0.5, 0.76, 0.05, 0.74],
        [0.5, 0.72, 0.55, 0.46, 0.72, 0.4],
        [0.92, 0.34, 1.05, 0.22, 1.05, 0],
      ],
      k,
    );
  solid(p, col, slug(1), 0.26, 3, 12);
  // Cœur de magma diffus sous les fissures.
  const c = p.ctx;
  c.save();
  c.translate(-r * 0.1, 0);
  p.radial(PALETTE.yellow, r * 0.75, 0.32, 0);
  c.restore();
  trace(p, hot(col, 0.35), 0.55, 1.2, slug(0.82));
  const lava = PALETTE.yellow;
  p.stroke(lava, 1.6, 6, line(r, [0.45, -0.55, 0.28, -0.3, 0.4, -0.08, 0.12, 0.15]));
  p.stroke(lava, 1.6, 6, line(r, [-0.25, 0.6, -0.08, 0.36, -0.3, 0.16, -0.14, -0.1, -0.5, -0.32]));
  p.stroke(lava, 1.4, 5, line(r, [-0.75, 0.3, -0.58, 0.1, -0.88, -0.02]));
  p.stroke(col, 2, 6, segs(r, [0.9, -0.16, 1.07, -0.4, 0.9, 0.16, 1.07, 0.4]));
  spark(p, r * 1.09, -r * 0.4, r * 0.12, 5);
  spark(p, r * 1.09, r * 0.4, r * 0.12, 5);
}

/** Golem de lave : bloc rocheux massif fissuré, noyau incandescent, cornes vers +x. */
function lavagolem(p: Pen, r: number, col: number): void {
  const radii = [1, 0.88, 1.02, 0.84, 0.98, 0.9, 1.02, 0.86, 1, 0.9, 0.96, 0.84];
  const rock: Path = (c) => {
    radii.forEach((k, i) => {
      const a = (i / radii.length) * TAU + 0.26;
      const x = Math.cos(a) * r * k;
      const y = Math.sin(a) * r * k;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
  };
  p.fill(col, 0.22, rock);
  p.stroke(col, 3.4, 12, rock);
  for (const s of [-1, 1]) {
    // Cornes recourbées vers l'avant.
    const horn = smooth(
      r,
      [0.3, 0.66],
      [
        [0.8, 1.12, 1.15, 0.46],
        [0.86, 0.78, 0.62, 0.42],
      ],
      1,
      s,
    );
    p.fill(hot(col, 0.3), 0.5, horn);
    p.stroke(hot(col, 0.3), 2.4, 8, horn);
  }
  const plate = shape(r, [0.55, -0.2, 0.3, -0.55, -0.3, -0.5, -0.58, -0.05, -0.3, 0.52, 0.32, 0.5]);
  p.fill(mix(col, 0x000000, 0.45), 0.5, plate);
  p.stroke(col, 1.8, 6, plate);
  for (const a of [0.7, 2.7, 4.4]) p.stroke(PALETTE.yellow, 1.8, 7, crack(r, a, 0.2, 0.95, 4, 0.1));
  p.fill(PALETTE.yellow, 0.9, disc(r, 0.2), 10);
  spark(p, 0, 0, r * 0.09, 4);
}

// --- Tireurs : bouche ou canon bien visible vers +x -----------------------------------------

/** Cracheur : disque à la bouche ouverte vers +x, goutte prête à partir (dessin d'origine). */
function spitter(p: Pen, r: number, col: number): void {
  const body: Path = (c) => {
    c.arc(0, 0, r * 0.85, 0.55, TAU - 0.55);
    c.lineTo(r * 0.2, 0);
    c.closePath();
  };
  p.fill(col, 0.25, body);
  p.stroke(col, 2.2, 10, body);
  p.stroke(col, 1.4, 6, disc(r, 0.35, -0.2));
  spark(p, -r * 0.2, 0, 1.8, 6);
  p.fill(col, 0.9, disc(r, 0.14, 0.72), 8);
}

/** Prisme tireur : prisme triangulaire à face arrière décalée, longue aiguille de tir vers +x. */
function prismsniper(p: Pen, r: number, col: number): void {
  const front = [0.62, 0, -0.55, -0.66, -0.55, 0.66];
  const dx = -0.26;
  const dy = -0.2;
  const back = front.map((v, i) => v + (i % 2 ? dy : dx));
  trace(p, col, 0.4, 1.2, shape(r, back));
  trace(
    p,
    col,
    0.35,
    1.1,
    segs(r, [
      front[0],
      front[1],
      back[0],
      back[1],
      front[2],
      front[3],
      back[2],
      back[3],
      front[4],
      front[5],
      back[4],
      back[5],
    ]),
  );
  const prism = shape(r, front);
  p.fill(col, 0.24, prism);
  p.stroke(col, 2.2, 9, prism);
  p.stroke(col, 1.2, 4, shape(r, [0.24, 0, -0.32, -0.34, -0.32, 0.34]));
  trace(p, PALETTE.white, 0.9, 1.3, line(r, [-0.42, -0.5, 0.1, -0.28]));
  p.stroke(col, 1.8, 7, line(r, [0.62, 0, 1.18, 0]));
  p.stroke(PALETTE.white, 1.4, 5, segs(r, [0.92, -0.16, 0.92, 0.16]));
  spark(p, r * 1.16, 0, r * 0.1, 8);
}

/** Baudroie : poisson à la grande gueule dentée vers +x, leurre terminé par une ampoule. */
function angler(p: Pen, r: number, col: number): void {
  const fish = smooth(
    r,
    [0.95, -0.4],
    [
      [0.6, -0.9, -0.3, -0.95, -0.72, -0.35],
      [-1.08, -0.46],
      [-0.96, 0],
      [-1.08, 0.46],
      [-0.72, 0.35],
      [-0.4, 0.85, 0.4, 0.9, 1.0, 0.5],
      [0.3, 0.12],
    ],
  );
  const lure: Path = (c) => {
    c.moveTo(r * 0.02, -r * 0.78);
    c.quadraticCurveTo(r * 0.2, -r * 1.25, r * 0.74, -r * 0.86);
  };
  p.stroke(col, 1.8, 6, lure);
  solid(p, col, fish, 0.26, 2.4, 10);
  // Crocs : un de chaque mâchoire.
  p.fill(PALETTE.white, 0.9, (c) => {
    c.moveTo(r * 0.8, -r * 0.34);
    c.lineTo(r * 0.72, -r * 0.08);
    c.lineTo(r * 0.62, -r * 0.3);
    c.moveTo(r * 0.86, r * 0.44);
    c.lineTo(r * 0.78, r * 0.18);
    c.lineTo(r * 0.68, r * 0.38);
  });
  spark(p, r * 0.25, -r * 0.3, r * 0.1, 4);
  p.fill(PALETTE.white, 1, disc(r, 0.14, 0.74, -0.86), 9);
}

/** Esprit du givre : flocon à six branches (celle de devant, plus longue, porte un point lumineux). */
function frostspirit(p: Pen, r: number, col: number): void {
  p.stroke(col, 1.8, 7, (c) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const len = i === 0 ? 1.2 : 1.0;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      c.moveTo(ca * r * 0.28, sa * r * 0.28);
      c.lineTo(ca * r * len, sa * r * len);
      for (const s of [-1, 1]) {
        const ba = a + s * 0.75;
        const bx = ca * r * len * 0.62;
        const by = sa * r * len * 0.62;
        c.moveTo(bx, by);
        c.lineTo(bx + Math.cos(ba) * r * 0.3, by + Math.sin(ba) * r * 0.3);
      }
    }
  });
  p.fill(col, 0.35, ngon(r, 6, 0.36, Math.PI / 6));
  p.stroke(col, 1.8, 6, ngon(r, 6, 0.36, Math.PI / 6));
  spark(p, 0, 0, r * 0.15, 7);
  p.fill(PALETTE.white, 1, disc(r, 0.09, 1.2), 6);
}

/** Hydre : corps ovale et cinq cous en éventail vers +x, têtes en pointe. */
function hydra(p: Pen, r: number, col: number): void {
  const heads = [-0.95, -0.48, 0, 0.48, 0.95];
  for (const phi of heads) {
    const d = phi === 0 ? 0.94 : 0.86;
    const ex = Math.cos(phi) * d;
    const ey = Math.sin(phi) * d;
    const cx = ex * 0.5 + 0.12;
    const cy = ey * 0.5 + phi * 0.3;
    p.stroke(col, 2.4, 6, (c) => {
      c.moveTo(-r * 0.15, phi * r * 0.2);
      c.quadraticCurveTo(cx * r, cy * r, ex * r, ey * r);
    });
    const ang = Math.atan2(ey - cy, ex - cx);
    const head = local(r, ex, ey, ang, shape(r, [0.3, 0, -0.04, -0.16, -0.04, 0.16]));
    p.fill(col, 0.5, head);
    p.stroke(col, 1.6, 5, head);
    p.fill(PALETTE.white, 1, local(r, ex, ey, ang, disc(r, 0.05, 0.06, 0)));
  }
  solid(p, col, oval(r, 0.68, 0.6, -0.42), 0.26, 2.6, 9);
  trace(p, col, 0.5, 1.2, line(r, [-0.8, -0.38, -0.55, 0, -0.8, 0.38]));
  trace(p, col, 0.5, 1.2, line(r, [-0.5, -0.4, -0.25, 0, -0.5, 0.4]));
}

// --- Kamikazes : ronds, gonflés, accents jaunes ---------------------------------------------

/** Kamikaze : disque cerclé de repères, croix rouge (dessin d'origine). */
function bomber(p: Pen, r: number, col: number): void {
  p.fill(col, 0.25, disc(r, 0.8));
  p.stroke(col, 2.2, 10, disc(r, 0.8));
  p.stroke(PALETTE.red, 2, 8, segs(r, [-0.4, -0.4, 0.4, 0.4, 0.4, -0.4, -0.4, 0.4]));
  p.stroke(col, 1.4, 6, (c) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      c.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
      c.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
    }
  });
}

/** Diodon : boule hérissée d'épines jaunes, deux yeux vers +x. */
function puffer(p: Pen, r: number, col: number): void {
  // Douze pointes triangulaires (langage « hérissé » : distinct des pattes filiformes de l'acarien).
  const spikes: Path = (c) => {
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      c.moveTo((ca * 0.66 - sa * 0.13) * r, (sa * 0.66 + ca * 0.13) * r);
      c.lineTo(ca * r * 1.16, sa * r * 1.16);
      c.lineTo((ca * 0.66 + sa * 0.13) * r, (sa * 0.66 - ca * 0.13) * r);
      c.closePath();
    }
  };
  p.fill(PALETTE.yellow, 0.85, spikes, 5);
  p.stroke(PALETTE.yellow, 1, 4, spikes);
  solid(p, col, disc(r, 0.74), 0.32, 2.2, 8);
  p.fill(col, 0.4, disc(r, 0.4, -0.12));
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, r * 0.13, r * 0.36, -r * 0.27);
    circle(c, r * 0.13, r * 0.36, r * 0.27);
  });
}

/** Cristal instable : gemme à facettes traversée de fissures jaunes. */
function frostbomb(p: Pen, r: number, col: number): void {
  const gem = ngon(r, 8, 0.92, Math.PI / 8);
  p.fill(col, 0.28, gem);
  p.stroke(col, 2.2, 10, gem);
  trace(p, PALETTE.white, 0.6, 1, ngon(r, 8, 0.48, 0));
  trace(p, PALETTE.white, 0.35, 1, (c) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const b = a + Math.PI / 8;
      c.moveTo(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48);
      c.lineTo(Math.cos(b) * r * 0.92, Math.sin(b) * r * 0.92);
      c.moveTo(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48);
      c.lineTo(Math.cos(b - Math.PI / 4) * r * 0.92, Math.sin(b - Math.PI / 4) * r * 0.92);
    }
  });
  p.stroke(PALETTE.yellow, 1.7, 6, line(r, [0, 0, 0.3, -0.2, 0.42, -0.58, 0.85, -0.72]));
  p.stroke(PALETTE.yellow, 1.7, 6, line(r, [0, 0, -0.34, 0.16, -0.6, 0.55]));
  spark(p, 0, 0, r * 0.13, 6);
}

/** Ballon putride : grosse poche ronde à pustules jaunes, nœud à l'arrière. */
function bloater(p: Pen, r: number, col: number): void {
  const knot = shape(r, [-0.82, -0.12, -1.12, -0.24, -1.12, 0.24, -0.82, 0.12]);
  p.stroke(col, 2, 6, knot);
  solid(p, col, disc(r, 0.88), 0.24, 2.4, 10);
  const pustules: [number, number, number][] = [
    [0.3, -0.38, 0.2],
    [-0.2, 0.4, 0.24],
    [-0.42, -0.28, 0.15],
    [0.42, 0.34, 0.13],
  ];
  for (const [x, y, k] of pustules) {
    p.fill(PALETTE.yellow, 0.55, disc(r, k, x, y), 5);
    p.fill(PALETTE.white, 0.9, disc(r, k * 0.35, x, y));
  }
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, r * 0.07, r * 0.62, -r * 0.14);
    circle(c, r * 0.07, r * 0.62, r * 0.14);
  });
}

// --- Téléporteurs : anguleux, fragments d'anneau --------------------------------------------

/** Clignoteur : losange à œil central (dessin d'origine). */
function blinker(p: Pen, r: number, col: number): void {
  p.fill(col, 0.22, ngon(r, 4, 1));
  p.stroke(col, 2.2, 11, ngon(r, 4, 1));
  p.fill(col, 0.6, (c) => {
    c.ellipse(0, 0, r * 0.45, r * 0.25, 0, 0, TAU);
  });
  spark(p, 0, 0, 2.2, 8);
}

/** Mirage : losange scintillant suivi de deux images rémanentes décalées. */
function mirage(p: Pen, r: number, col: number): void {
  const dia = (x: number, y: number): Path =>
    shape(r, [x + 0.76, y, x, y - 0.46, x - 0.76, y, x, y + 0.46]);
  // Images rémanentes : deux contours fantômes décalés derrière le losange.
  p.fill(col, 0.05, dia(-0.5, 0.2));
  trace(p, col, 0.42, 1.4, dia(-0.5, 0.2));
  p.fill(col, 0.08, dia(-0.1, -0.2));
  trace(p, col, 0.68, 1.5, dia(-0.1, -0.2));
  const main = dia(0.3, 0);
  p.fill(col, 0.28, main);
  p.stroke(col, 2.4, 10, main);
  trace(p, PALETTE.white, 0.6, 1, shape(r, [0.94, 0, 0.3, -0.26, -0.28, 0, 0.3, 0.26]));
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      const x = r * 0.48;
      const y = -r * 0.5;
      const l = r * 0.3;
      c.moveTo(x, y - l);
      c.quadraticCurveTo(x, y, x + l, y);
      c.quadraticCurveTo(x, y, x, y + l);
      c.quadraticCurveTo(x, y, x - l, y);
      c.quadraticCurveTo(x, y, x, y - l);
      c.closePath();
    },
    6,
  );
  spark(p, r * 0.3, 0, r * 0.13, 6);
}

/** Chevalier du vide : silhouette élancée, épée à deux mains vers +x, anneau de téléportation brisé. */
function voidknight(p: Pen, r: number, col: number): void {
  // Anneau de téléportation brisé en trois fragments.
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * TAU + 0.5;
    trace(p, col, 0.7, 1.6, (c) => {
      c.arc(0, 0, r * 1.0, a0, a0 + 1.0);
    });
  }
  const cape = shape(r, [-0.15, -0.34, -1.0, 0, -0.15, 0.34]);
  p.fill(col, 0.18, cape);
  trace(p, col, 0.8, 1.5, cape);
  for (const s of [-1, 1]) {
    // Bras fermes vers la poignée de l'épée, épaulière anguleuse.
    p.stroke(col, 2.6, 7, line(r, [-0.05, 0.54, 0.46, 0.06], s));
    const pauldron = shape(r, [0.12, 0.34, -0.02, 0.8, -0.34, 0.62, -0.28, 0.3], s);
    p.fill(col, 0.32, pauldron);
    p.stroke(col, 2.2, 8, pauldron);
  }
  // Épée à deux mains : lame lumineuse, garde et pommeau.
  p.stroke(PALETTE.white, 2.6, 8, line(r, [0.5, 0, 1.17, 0]));
  p.stroke(col, 2.2, 6, segs(r, [0.5, -0.28, 0.5, 0.28]));
  const helm = disc(r, 0.27);
  p.fill(col, 0.55, helm);
  p.stroke(col, 2, 7, helm);
  spark(p, r * 0.08, 0, r * 0.11, 6);
}

// --- Invocateurs : grands, cœur ou portail lumineux -----------------------------------------

/** Sirène : ombrelle de méduse ouverte vers +x, tentacules vers l'arrière, cœur lumineux. */
function siren(p: Pen, r: number, col: number): void {
  const ys = [-0.85, -0.43, 0, 0.43, 0.85];
  p.stroke(col, 1.6, 6, (c) => {
    ys.forEach((y0, i) => {
      const len = 1.2 - Math.abs(y0) * 0.35;
      c.moveTo(-r * 0.22, y0 * r);
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        c.lineTo(-r * (0.22 + (len - 0.22) * t), y0 * r + Math.sin(t * 7 + i * 1.3) * r * 0.12 * t);
      }
    });
  });
  // Ombrelle : dôme vers l'avant, bord arrière festonné.
  const bell = smooth(
    r,
    [-0.2, -0.85],
    [
      [0.5, -0.95, 1.0, -0.5, 1.0, 0],
      [1.0, 0.5, 0.5, 0.95, -0.2, 0.85],
      [-0.4, 0.64, -0.2, 0.43],
      [-0.4, 0.22, -0.2, 0],
      [-0.4, -0.22, -0.2, -0.43],
      [-0.4, -0.64, -0.2, -0.85],
    ],
  );
  solid(p, col, bell, 0.24, 2.4, 10);
  trace(p, col, 0.5, 1.1, line(r, [0.95, 0, 0.3, -0.5, 0.05, -0.8]));
  trace(p, col, 0.5, 1.1, line(r, [0.95, 0, 0.3, 0.5, 0.05, 0.8]));
  const c = p.ctx;
  c.save();
  c.translate(r * 0.28, 0);
  p.radial(PALETTE.magenta, r * 0.55, 0.85, 0);
  c.restore();
  spark(p, r * 0.28, 0, r * 0.16, 9);
}

/** Porte-drones : coque oblongue, baie de lancement, quatre chasseurs arrimés. */
function carrier(p: Pen, r: number, col: number): void {
  const fighter = (x: number, s: number): Path =>
    shape(r, [x + 0.22, 0.86, x - 0.14, 0.7, x - 0.14, 1.02], s);
  for (const x of [0.4, -0.5]) {
    for (const s of [-1, 1]) {
      p.fill(col, 0.4, fighter(x, s));
      p.stroke(col, 1.6, 5, fighter(x, s));
    }
  }
  const hull = shape(
    r,
    [1.15, 0, 0.55, -0.55, -0.85, -0.6, -1.05, -0.35, -1.05, 0.35, -0.85, 0.6, 0.55, 0.55],
  );
  solid(p, col, hull, 0.22, 2.6, 10);
  const bay = shape(r, [0.2, -0.24, -0.65, -0.24, -0.65, 0.24, 0.2, 0.24]);
  p.fill(deep(col, 0.6), 0.7, bay);
  p.stroke(hot(col, 0.4), 1.6, 6, bay);
  trace(p, PALETTE.white, 0.9, 1.4, line(r, [-0.5, 0, 0.05, 0]));
  spark(p, r * 0.78, 0, r * 0.11, 7);
}

/** Mère couveuse : reine insecte, abdomen-sac d'œufs vers l'arrière, mandibules vers +x. */
function broodmother(p: Pen, r: number, col: number): void {
  for (const s of [-1, 1]) {
    p.stroke(col, 1.8, 5, line(r, [0.3, 0.3, 0.55, 0.7, 0.6, 0.94], s));
    p.stroke(col, 1.8, 5, line(r, [0.12, 0.34, 0.1, 0.78, 0.02, 1.02], s));
    p.stroke(col, 1.8, 5, line(r, [-0.05, 0.3, -0.35, 0.72, -0.52, 0.92], s));
  }
  solid(p, col, oval(r, 0.66, 0.58, -0.52), 0.2, 2.4, 9);
  const eggs: [number, number, number, number][] = [
    [-0.36, -0.02, 0.15, 0.2],
    [-0.57, -0.28, 0.13, 0.17],
    [-0.57, 0.26, 0.14, 0.18],
    [-0.83, -0.08, 0.12, 0.16],
    [-0.83, 0.2, 0.1, 0.14],
    [-0.24, 0.32, 0.1, 0.13],
  ];
  for (const [x, y, rx, ry] of eggs) {
    p.fill(hot(col, 0.5), 0.5, oval(r, rx, ry, x, y, 1.4));
    trace(p, hot(col, 0.6), 0.9, 1, oval(r, rx, ry, x, y, 1.4));
  }
  solid(p, col, oval(r, 0.4, 0.36, 0.14), 0.32, 2.4, 9);
  solid(p, col, disc(r, 0.24, 0.68), 0.4, 2, 7);
  for (const s of [-1, 1]) p.stroke(col, 2, 6, line(r, [0.84, 0.14, 1.08, 0.32, 1.12, 0.1], s));
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, r * 0.06, r * 0.74, -r * 0.1);
    circle(c, r * 0.06, r * 0.74, r * 0.1);
  });
}

// --- Boucliers : corps seul, avant dégagé (l'arc est ajouté en jeu) -------------------------

/** Crabe-bouclier : carapace large, pattes latérales, pinces aux extrémités de l'arc de bouclier ; avant dégagé. */
function crab(p: Pen, r: number, col: number): void {
  for (const s of [-1, 1]) {
    for (const x of [0.15, -0.2, -0.48]) {
      p.stroke(col, 1.8, 5, line(r, [x, 0.62, x - 0.05, 0.88, x - 0.2, 0.98], s));
    }
    // Pince tenant le bouclier : bras + deux mâchoires vers l'avant.
    p.stroke(col, 2.2, 6, line(r, [0.3, 0.68, 0.5, 0.92], s));
    p.stroke(col, 2.2, 6, line(r, [0.86, 0.84, 0.5, 0.92, 0.84, 0.6], s));
  }
  solid(p, col, oval(r, 0.7, 0.82, -0.05), 0.26, 2.6, 10);
  trace(p, col, 0.55, 1.3, oval(r, 0.42, 0.52, -0.16));
  trace(p, col, 0.45, 1.2, line(r, [-0.62, -0.3, -0.5, 0, -0.62, 0.3]));
  p.stroke(col, 1.4, 4, segs(r, [0.55, -0.2, 0.68, -0.28, 0.55, 0.2, 0.68, 0.28]));
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      circle(c, r * 0.08, r * 0.7, -r * 0.29);
      circle(c, r * 0.08, r * 0.7, r * 0.29);
    },
    4,
  );
}

/** Colosse de cristal : torse hexagonal à facettes, côté plat vers +x ; avant dégagé. */
function crystalgolem(p: Pen, r: number, col: number): void {
  const R6 = 0.86;
  const rot = Math.PI / 6;
  for (const s of [-1, 1]) {
    const shoulder = shape(r, [0.28, 0.66, -0.3, 0.7, 0, 1.2], s);
    p.fill(col, 0.28, shoulder);
    p.stroke(col, 2.2, 8, shoulder);
    const spike = shape(r, [-0.7, 0.28, -0.72, 0.58, -1.14, 0.3], s);
    p.fill(col, 0.22, spike);
    p.stroke(col, 1.8, 6, spike);
  }
  // Six facettes triangulaires, alternativement claires et sombres.
  for (let i = 0; i < 6; i++) {
    const a0 = rot + (i / 6) * TAU;
    const a1 = rot + ((i + 1) / 6) * TAU;
    p.fill(col, i % 2 ? 0.34 : 0.14, (c) => {
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a0) * R6 * r, Math.sin(a0) * R6 * r);
      c.lineTo(Math.cos(a1) * R6 * r, Math.sin(a1) * R6 * r);
      c.closePath();
    });
  }
  p.stroke(col, 3, 12, ngon(r, 6, R6, rot));
  trace(p, hot(col, 0.5), 0.6, 1.1, (c) => {
    for (let i = 0; i < 6; i++) {
      const a = rot + (i / 6) * TAU;
      c.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
      c.lineTo(Math.cos(a) * r * R6, Math.sin(a) * r * R6);
    }
  });
  p.fill(col, 0.5, ngon(r, 6, 0.3, 0));
  p.stroke(col, 1.8, 6, ngon(r, 6, 0.3, 0));
  spark(p, 0, 0, r * 0.1, 7);
}

/** Gardien : barre d'épaules de chevalier lourd, heaume, poings serrés sur le bouclier ; avant dégagé. */
function warden(p: Pen, r: number, col: number): void {
  // Panache traînant derrière le heaume.
  const plume = shape(r, [-0.2, -0.1, -0.95, -0.2, -1.02, 0, -0.95, 0.2, -0.2, 0.1]);
  p.fill(col, 0.2, plume);
  trace(p, col, 0.75, 1.4, plume);
  for (const s of [-1, 1]) {
    // Bras replié vers l'avant : le poing tient le bouclier ajouté en jeu.
    p.stroke(col, 4, 6, line(r, [0.0, 0.92, 0.5, 0.84, 0.74, 0.5], s));
    p.fill(col, 0.5, disc(r, 0.17, 0.8, s * 0.46));
    p.stroke(col, 2, 6, disc(r, 0.17, 0.8, s * 0.46));
    // Pointe d'épaulière.
    p.stroke(col, 2.2, 7, shape(r, [0.12, 0.98, -0.1, 1.24, -0.32, 0.98], s));
  }
  // Barre d'épaules aux coins chanfreinés : plastron et épaulières d'un seul tenant.
  const bar = shape(
    r,
    [
      0.3, -0.7, 0.14, -0.98, -0.34, -0.98, -0.5, -0.7, -0.5, 0.7, -0.34, 0.98, 0.14, 0.98, 0.3,
      0.7,
    ],
  );
  solid(p, col, bar, 0.3, 2.8, 10);
  trace(p, hot(col, 0.5), 0.6, 1.2, line(r, [-0.2, -0.8, -0.2, 0.8]));
  const helm = disc(r, 0.34, 0.08);
  p.fill(col, 0.6, helm);
  p.stroke(col, 2.2, 8, helm);
  p.stroke(PALETTE.white, 1.8, 6, segs(r, [0.34, -0.16, 0.34, 0.16]));
  p.stroke(PALETTE.yellow, 1.6, 5, line(r, [-0.05, 0, -0.34, 0]));
}

// --- Chargeurs : coin, flèche, cornes vers +x -----------------------------------------------

/** Spectre de cendre : coin fantomatique vers +x, lambeaux et braises vers l'arrière. */
function ashwraith(p: Pen, r: number, col: number): void {
  const ghost = shape(
    r,
    [
      1.15, 0, 0.1, -0.62, -0.15, -0.66, -0.55, -0.78, -0.42, -0.42, -1.05, -0.48, -0.65, -0.16,
      -1.15, 0, -0.65, 0.16, -1.05, 0.48, -0.42, 0.42, -0.55, 0.78, -0.15, 0.66, 0.1, 0.62,
    ],
  );
  p.fill(col, 0.2, ghost);
  p.stroke(col, 2, 9, ghost);
  p.stroke(PALETTE.white, 1.8, 5, segs(r, [0.12, -0.32, 0.5, -0.12, 0.12, 0.32, 0.5, 0.12]));
  p.fill(
    PALETTE.orange,
    0.85,
    (c) => {
      circle(c, r * 0.07, -r * 0.9, -r * 0.62);
      circle(c, r * 0.07, -r * 0.9, r * 0.62);
      circle(c, r * 0.06, -r * 1.12, r * 0.22);
    },
    5,
  );
}

/** Méca d'assaut : torse carré chanfreiné, deux canons de bras vers +x, tuyères à l'arrière. */
function mech(p: Pen, r: number, col: number): void {
  for (const s of [-1, 1]) {
    p.stroke(PALETTE.orange, 2, 6, segs(r, [-0.66, 0.3, -0.88, 0.3], s));
    const arm = shape(r, [-0.15, 0.58, 0.42, 0.58, 0.42, 0.86, -0.15, 0.86], s);
    p.fill(col, 0.26, arm);
    p.stroke(col, 2.2, 8, arm);
    p.stroke(col, 3, 8, line(r, [0.42, 0.7, 0.9, 0.7], s));
    p.fill(PALETTE.orange, 1, disc(r, 0.09, 0.94, s * 0.7), 6);
  }
  const torso = shape(
    r,
    [
      -0.45, -0.62, 0.45, -0.62, 0.62, -0.42, 0.62, 0.42, 0.45, 0.62, -0.45, 0.62, -0.62, 0.42,
      -0.62, -0.42,
    ],
  );
  solid(p, col, torso, 0.24, 2.8, 10);
  p.stroke(col, 2, 6, line(r, [-0.05, -0.32, 0.3, 0, -0.05, 0.32]));
  p.stroke(PALETTE.white, 2.4, 6, segs(r, [0.42, -0.22, 0.42, 0.22]));
}

/** Loup de givre : tête en coin, oreilles, crocs et yeux obliques, museau vers +x. */
function icewolf(p: Pen, r: number, col: number): void {
  for (const s of [-1, 1]) {
    const ear = shape(r, [0.0, 0.44, -0.42, 1.05, -0.64, 0.4], s);
    p.fill(col, 0.34, ear);
    p.stroke(col, 2, 7, ear);
  }
  const head = shape(
    r,
    [
      1.2, 0, 0.72, -0.2, 0.4, -0.48, 0.24, -0.72, 0.06, -0.5, -0.12, -0.72, -0.28, -0.48, -0.55,
      -0.34, -0.62, 0, -0.55, 0.34, -0.28, 0.48, -0.12, 0.72, 0.06, 0.5, 0.24, 0.72, 0.4, 0.48,
      0.72, 0.2,
    ],
  );
  solid(p, col, head, 0.28, 2.4, 9);
  for (const s of [-1, 1]) {
    p.stroke(PALETTE.white, 2, 5, line(r, [0.12, 0.3, 0.5, 0.12], s));
    p.fill(PALETTE.white, 0.95, shape(r, [0.86, 0.12, 0.74, 0.3, 0.68, 0.14], s));
  }
  spark(p, r * 1.1, 0, r * 0.1, 5);
}

// --- Mortiers : trapus, gros canon avec braise ou obus --------------------------------------

/** Mortier igné : base trapue, gros canon vers +x, braise dans la gueule. */
function firemortar(p: Pen, r: number, col: number): void {
  const base = shape(
    r,
    [0.35, -0.85, -0.55, -0.85, -0.95, -0.5, -0.95, 0.5, -0.55, 0.85, 0.35, 0.85],
  );
  solid(p, col, base, 0.24, 3, 10);
  trace(p, col, 0.6, 1.3, shape(r, [-0.15, -0.55, -0.7, -0.55, -0.7, 0.55, -0.15, 0.55]));
  const barrel = shape(r, [0.1, -0.4, 0.95, -0.4, 0.95, 0.4, 0.1, 0.4]);
  p.fill(col, 0.34, barrel);
  p.stroke(col, 2.6, 9, barrel);
  p.stroke(hot(col, 0.3), 3.2, 8, segs(r, [1.0, -0.5, 1.0, 0.5]));
  // Braise prête à partir dans la gueule du canon.
  p.fill(PALETTE.red, 0.9, disc(r, 0.27, 0.85), 10);
  p.fill(PALETTE.white, 1, disc(r, 0.13, 0.87), 8);
}

/** Yéti : corps rond à fourrure dentelée, deux gros bras portant une boule de neige vers +x. */
function yeti(p: Pen, r: number, col: number): void {
  const fur: Path = (c) => {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const k = i % 2 === 0 ? 1.02 : 0.8;
      const x = Math.cos(a) * r * k;
      const y = Math.sin(a) * r * k;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  for (const s of [-1, 1]) {
    p.stroke(col, 5, 6, line(r, [0.0, 0.68, 0.5, 0.78, 0.74, 0.68], s));
    p.fill(col, 0.4, disc(r, 0.24, 0.76, s * 0.66));
    p.stroke(col, 2, 7, disc(r, 0.24, 0.76, s * 0.66));
  }
  p.fill(col, 0.16, fur);
  p.stroke(col, 2.4, 10, fur);
  p.fill(deep(col, 0.6), 0.6, disc(r, 0.34, 0.26));
  p.stroke(col, 1.6, 5, disc(r, 0.34, 0.26));
  p.fill(
    PALETTE.cyan,
    1,
    (c) => {
      circle(c, r * 0.07, r * 0.4, -r * 0.13);
      circle(c, r * 0.07, r * 0.4, r * 0.13);
    },
    5,
  );
  p.fill(PALETTE.white, 0.95, disc(r, 0.18, 0.82), 10);
}

// --- Tourelles : symétrie radiale, noyau central --------------------------------------------

/** Tourelle : socle octogonal, six canons radiaux, noyau central. */
function turret(p: Pen, r: number, col: number): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const gun = local(
      r,
      0,
      0,
      a,
      shape(r, [0.5, -0.17, 0.9, -0.12, 1.14, -0.09, 1.14, 0.09, 0.9, 0.12, 0.5, 0.17]),
    );
    p.fill(col, 0.34, gun);
    p.stroke(col, 2, 7, gun);
    p.fill(PALETTE.white, 0.9, local(r, 0, 0, a, disc(r, 0.06, 1.14)), 4);
  }
  p.fill(col, 0.28, ngon(r, 8, 0.62, Math.PI / 8));
  p.stroke(col, 2.6, 10, ngon(r, 8, 0.62, Math.PI / 8));
  p.fill(deep(col, 0.5), 0.6, disc(r, 0.34));
  p.stroke(col, 1.6, 6, disc(r, 0.34));
  spark(p, 0, 0, r * 0.14, 8);
}

/** Séraphin déchu : six ailes en faucille autour d'un halo brisé et d'un œil rouge. */
function seraph(p: Pen, r: number, col: number): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const wing: Path = local(r, 0, 0, a, (c) => {
      c.moveTo(r * 0.28, 0);
      c.quadraticCurveTo(r * 0.65, -r * 0.32, r * 1.17, r * 0.16);
      c.quadraticCurveTo(r * 0.7, r * 0.16, r * 0.28, 0);
      c.closePath();
    });
    p.fill(col, 0.24, wing);
    p.stroke(col, 2, 8, wing);
    trace(p, hot(col, 0.5), 0.6, 1, local(r, 0, 0, a, line(r, [0.4, -0.02, 0.85, 0.0])));
  }
  p.stroke(PALETTE.white, 1.6, 8, (c) => {
    c.arc(0, 0, r * 0.46, 0.5, Math.PI - 0.2);
    c.moveTo(Math.cos(Math.PI + 0.35) * r * 0.46, Math.sin(Math.PI + 0.35) * r * 0.46);
    c.arc(0, 0, r * 0.46, Math.PI + 0.35, TAU - 0.5);
  });
  p.fill(PALETTE.white, 1, oval(r, 0.14, 0.24), 9);
  p.fill(PALETTE.red, 0.95, oval(r, 0.05, 0.16));
}

// --- Soutiens : halo, antenne ou émetteur ---------------------------------------------------

/** Projecteur de bouclier : émetteur hexagonal à trois branches dans une bulle en grille hexagonale. */
function projector(p: Pen, r: number, col: number): void {
  trace(p, col, 0.45, 1.2, ngon(r, 6, 1.06, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const bx = Math.cos(a);
    const by = Math.sin(a);
    p.stroke(col, 1.8, 6, segs(r, [bx * 0.45, by * 0.45, bx * 0.78, by * 0.78]));
    p.fill(col, 0.36, ngon(r, 6, 0.26, 0, bx * 0.95, by * 0.95));
    p.stroke(col, 1.8, 6, ngon(r, 6, 0.26, 0, bx * 0.95, by * 0.95));
  }
  p.fill(col, 0.3, ngon(r, 6, 0.52, Math.PI / 6));
  p.stroke(col, 2.2, 8, ngon(r, 6, 0.52, Math.PI / 6));
  trace(p, hot(col, 0.5), 0.7, 1.1, ngon(r, 6, 0.26, 0));
  spark(p, 0, 0, r * 0.11, 6);
}

/** Acolyte : silhouette encapuchonnée aux yeux luisants, manches jointes sur un sigle, anneau de halo. */
function acolyte(p: Pen, r: number, col: number): void {
  trace(p, col, 0.75, 1.4, disc(r, 1.04), [r * 0.22, r * 0.16]);
  // Cape aux larges épaules, manches jointes vers l'avant, sigle lumineux entre les mains.
  solid(p, col, oval(r, 0.36, 0.86, -0.24), 0.2, 2, 7);
  for (const s of [-1, 1]) p.stroke(col, 2.6, 6, line(r, [-0.1, 0.7, 0.3, 0.5, 0.7, 0.1], s));
  // Capuche : cavité sombre où brillent deux yeux.
  const hood = disc(r, 0.4, -0.02);
  p.fill(col, 0.55, hood);
  p.stroke(col, 2.2, 8, hood);
  p.fill(deep(col, 0.8), 0.95, disc(r, 0.25, 0.05));
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      circle(c, r * 0.06, r * 0.18, -r * 0.09);
      circle(c, r * 0.06, r * 0.18, r * 0.09);
    },
    4,
  );
  p.stroke(PALETTE.white, 1.6, 7, shape(r, [1.0, 0, 0.86, -0.14, 0.72, 0, 0.86, 0.14]));
  spark(p, r * 0.86, 0, r * 0.05, 4);
}

// --- Fouisseur et stampede ------------------------------------------------------------------

/** Fouisseur : corps segmenté effilé vers l'arrière, tête à mandibules vers +x. */
function sandworm(p: Pen, r: number, col: number): void {
  const tube = smooth(
    r,
    [0.25, -0.55],
    [
      [-0.9, -0.34],
      [-1.2, 0, -0.9, 0.34],
      [0.25, 0.55],
    ],
  );
  p.fill(col, 0.2, tube);
  p.stroke(col, 2.2, 8, tube);
  for (const x of [-0.4, -0.66, -0.9]) {
    const h = 0.34 + ((x + 0.9) / 1.15) * 0.21;
    p.stroke(col, 1.6, 4, (c) => {
      c.moveTo(x * r, -h * r);
      c.quadraticCurveTo((x + 0.12) * r, 0, x * r, h * r);
    });
  }
  const head = disc(r, 0.58, 0.18);
  p.fill(col, 0.3, head);
  p.stroke(col, 2.6, 10, head);
  for (const s of [-1, 1]) {
    const mandible = smooth(
      r,
      [0.5, 0.42],
      [
        [0.95, 0.85, 1.2, 0.15],
        [0.98, 0.4, 0.55, 0.2],
      ],
      1,
      s,
    );
    p.fill(hot(col, 0.3), 0.5, mandible);
    p.stroke(hot(col, 0.3), 2, 7, mandible);
  }
  p.fill(PALETTE.red, 0.7, disc(r, 0.2, 0.5), 6);
  spark(p, r * 0.5, 0, r * 0.08, 4);
}

/** Scarabée doré : élytres brillants, reflets blancs, pattes en éventail. */
function goldling(p: Pen, r: number, col: number): void {
  for (const s of [-1, 1]) {
    p.stroke(col, 1.4, 4, line(r, [0.4, 0.5, 0.8, 0.85], s));
    p.stroke(col, 1.4, 4, line(r, [0.0, 0.62, 0.0, 1.02], s));
    p.stroke(col, 1.4, 4, line(r, [-0.45, 0.52, -0.85, 0.85], s));
    p.stroke(col, 1.4, 4, line(r, [0.95, 0.1, 1.15, 0.32], s));
  }
  solid(p, col, oval(r, 0.75, 0.64, -0.15), 0.36, 2.2, 8);
  solid(p, col, oval(r, 0.32, 0.46, 0.52), 0.42, 1.8, 6);
  solid(p, col, disc(r, 0.15, 0.9), 0.5, 1.6, 4);
  trace(p, hot(col, 0.5), 0.8, 1.1, line(r, [-0.85, 0, 0.2, 0]));
  p.stroke(PALETTE.white, 1.2, 3, (c) => {
    c.arc(-r * 0.15, 0, r * 0.5, -2.6, -1.7);
  });
  spark(p, -r * 0.5, -r * 0.3, r * 0.08, 3);
}

// --- Filet de sécurité : dessin générique par comportement ----------------------------------

/** Dessin simple selon le comportement, pour tout ennemi sans dessin propre. */
function generic(p: Pen, def: EnemyDef, r: number, col: number): void {
  switch (def.behavior) {
    case 'swarm':
      solid(p, col, disc(r, 0.72), 0.28, 2, 8);
      spark(p, r * 0.3, 0, r * 0.14, 4);
      break;
    case 'tank':
      solid(p, col, ngon(r, 6, 1), 0.22, 2.8, 10);
      solid(p, col, ngon(r, 6, 0.55), 0.4, 1.8, 6);
      break;
    case 'shooter':
      solid(p, col, disc(r, 0.8), 0.25, 2.2, 9);
      p.stroke(col, 2.6, 8, line(r, [0.6, 0, 1.15, 0]));
      spark(p, r * 0.1, 0, r * 0.16, 6);
      break;
    case 'kamikaze':
      solid(p, col, disc(r, 0.8), 0.25, 2.2, 9);
      p.stroke(PALETTE.yellow, 2, 7, segs(r, [-0.4, -0.4, 0.4, 0.4, 0.4, -0.4, -0.4, 0.4]));
      break;
    case 'teleporter':
      solid(p, col, ngon(r, 4, 1), 0.22, 2.2, 10);
      spark(p, 0, 0, r * 0.16, 7);
      break;
    case 'summoner':
      solid(p, col, disc(r, 0.85), 0.2, 2.4, 10);
      p.stroke(col, 1.6, 6, disc(r, 0.45));
      spark(p, 0, 0, r * 0.18, 8);
      break;
    case 'shield':
      solid(p, col, oval(r, 0.72, 0.88), 0.26, 2.6, 10);
      spark(p, r * 0.4, 0, r * 0.12, 5);
      break;
    case 'charger':
      solid(p, col, shape(r, [1.15, 0, -0.6, -0.8, -0.3, 0, -0.6, 0.8]), 0.24, 2.4, 10);
      spark(p, r * 0.2, 0, r * 0.12, 5);
      break;
    case 'mortar':
      solid(p, col, oval(r, 0.8, 0.75, -0.2), 0.24, 2.8, 10);
      solid(p, col, shape(r, [0.1, -0.35, 1.0, -0.35, 1.0, 0.35, 0.1, 0.35]), 0.34, 2.4, 8);
      p.fill(PALETTE.red, 0.85, disc(r, 0.2, 0.85), 8);
      break;
    case 'turret':
      solid(p, col, ngon(r, 8, 0.7, Math.PI / 8), 0.28, 2.6, 10);
      p.stroke(col, 2.4, 7, (c) => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          c.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
          c.lineTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1);
        }
      });
      spark(p, 0, 0, r * 0.14, 7);
      break;
    case 'support':
      trace(p, col, 0.5, 1.2, ngon(r, 6, 1.05));
      solid(p, col, ngon(r, 6, 0.55), 0.3, 2.2, 8);
      spark(p, 0, 0, r * 0.12, 6);
      break;
    case 'burrower':
      solid(p, col, disc(r, 0.42, -0.6), 0.24, 2.2, 8);
      solid(p, col, disc(r, 0.6, 0.1), 0.3, 2.6, 10);
      p.stroke(hot(col, 0.3), 2.6, 7, line(r, [0.55, -0.4, 1.1, -0.1]));
      p.stroke(hot(col, 0.3), 2.6, 7, line(r, [0.55, 0.4, 1.1, 0.1]));
      break;
    case 'stampede':
      solid(p, col, oval(r, 0.8, 0.65), 0.36, 2.2, 10);
      spark(p, r * 0.3, 0, r * 0.12, 5);
      break;
    default:
      solid(p, col, disc(r, 0.8), 0.25, 2.2, 9);
      spark(p, r * 0.25, 0, r * 0.14, 5);
  }
}

/** Dessine le sprite d'un ennemi (origine au centre, avant vers +x). */
export function drawEnemyArt(p: Pen, def: EnemyDef): void {
  const r = def.radius;
  const col = colorOf(def.color);
  switch (def.id) {
    case 'mite':
      mite(p, r, col);
      break;
    case 'brute':
      brute(p, r, col);
      break;
    case 'spitter':
      spitter(p, r, col);
      break;
    case 'bomber':
      bomber(p, r, col);
      break;
    case 'blinker':
      blinker(p, r, col);
      break;
    case 'shardling':
      shardling(p, r, col);
      break;
    case 'sandworm':
      sandworm(p, r, col);
      break;
    case 'prismsniper':
      prismsniper(p, r, col);
      break;
    case 'glassgolem':
      glassgolem(p, r, col);
      break;
    case 'mirage':
      mirage(p, r, col);
      break;
    case 'eel':
      eel(p, r, col);
      break;
    case 'crab':
      crab(p, r, col);
      break;
    case 'siren':
      siren(p, r, col);
      break;
    case 'angler':
      angler(p, r, col);
      break;
    case 'puffer':
      puffer(p, r, col);
      break;
    case 'emberbat':
      emberbat(p, r, col);
      break;
    case 'magmaslug':
      magmaslug(p, r, col);
      break;
    case 'lavagolem':
      lavagolem(p, r, col);
      break;
    case 'firemortar':
      firemortar(p, r, col);
      break;
    case 'ashwraith':
      ashwraith(p, r, col);
      break;
    case 'drone':
      drone(p, r, col);
      break;
    case 'turret':
      turret(p, r, col);
      break;
    case 'projector':
      projector(p, r, col);
      break;
    case 'mech':
      mech(p, r, col);
      break;
    case 'carrier':
      carrier(p, r, col);
      break;
    case 'icewolf':
      icewolf(p, r, col);
      break;
    case 'frostspirit':
      frostspirit(p, r, col);
      break;
    case 'crystalgolem':
      crystalgolem(p, r, col);
      break;
    case 'yeti':
      yeti(p, r, col);
      break;
    case 'frostbomb':
      frostbomb(p, r, col);
      break;
    case 'mosquito':
      mosquito(p, r, col);
      break;
    case 'toad':
      toad(p, r, col);
      break;
    case 'bloater':
      bloater(p, r, col);
      break;
    case 'broodmother':
      broodmother(p, r, col);
      break;
    case 'hydra':
      hydra(p, r, col);
      break;
    case 'wisp':
      wisp(p, r, col);
      break;
    case 'acolyte':
      acolyte(p, r, col);
      break;
    case 'warden':
      warden(p, r, col);
      break;
    case 'voidknight':
      voidknight(p, r, col);
      break;
    case 'seraph':
      seraph(p, r, col);
      break;
    case 'goldling':
      goldling(p, r, col);
      break;
    default:
      generic(p, def, r, col);
  }
}
