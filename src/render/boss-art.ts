/**
 * Sprites de boss dessinés en Canvas2D (vectoriel néon) : un dessin propre à chaque identifiant
 * de config/bosses.json, plus un octogone générique en filet de sécurité. Repère : origine au
 * centre du sprite, unités monde, l'AVANT du boss est vers +x (le sprite est tourné vers son
 * déplacement). La cellule d'atlas fait ceil(3 × r + 20) de côté : la géométrie reste sous
 * ~1,25 × r et les halos sous 16, de sorte que tout tient dans la demi-largeur 1,5 × r + 10.
 * Seul le crayon (Pen) pose de la couleur : le même dessin est rejoué en « mode blanc » pour le
 * flash de coup. Chaque boss empile plusieurs couches : ombres et membres, carapace, détails,
 * puis noyau lumineux (point faible) tout devant.
 */
import { colorOf, type BossDef } from '../content/data';
import { PALETTE, mix } from './palette';
import { circle, poly, type Ctx, type Pen } from './pen';

type Path = (c: Ctx) => void;
type Pt = [number, number];

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
 * Contour lisse fermé : point de départ puis segments en fractions de r (s = -1 pour la
 * symétrique en y) : 2 valeurs = droite, 4 = courbe quadratique, 6 = courbe de Bézier cubique.
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

/** Enchaîne plusieurs tracés dans un même chemin (un seul remplissage / contour). */
const all =
  (...paths: Path[]): Path =>
  (c) => {
    for (const q of paths) q(c);
  };

/** Point d'une courbe de Bézier cubique. */
const bez = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    a[0] * w0 + b[0] * w1 + c[0] * w2 + d[0] * w3,
    a[1] * w0 + b[1] * w1 + c[1] * w2 + d[1] * w3,
  ];
};

/** Bande de largeur variable le long d'une épine (coordonnées absolues, pas en fractions de r). */
const ribbon =
  (spine: (t: number) => Pt, half: (t: number) => number, n = 24): Path =>
  (c) => {
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = spine(Math.max(0, t - 0.02));
      const b = spine(Math.min(1, t + 0.02));
      const [x, y] = spine(t);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const h = half(t);
      left.push([x - (dy / len) * h, y + (dx / len) * h]);
      right.push([x + (dy / len) * h, y - (dx / len) * h]);
    }
    c.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i <= n; i++) c.lineTo(left[i][0], left[i][1]);
    for (let i = n; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
    c.closePath();
  };

/** Ligne suivant une épine (tracé ouvert), de t0 à t1. */
const along =
  (spine: (t: number) => Pt, t0 = 0, t1 = 1, n = 24): Path =>
  (c) => {
    for (let i = 0; i <= n; i++) {
      const [x, y] = spine(t0 + ((t1 - t0) * i) / n);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  };

/** Fissure en zigzag le long de l'angle a, du rayon r0 au rayon r1 (en fractions de r). */
const crack =
  (r: number, a: number, r0: number, r1: number, n = 4, amp = 0.09, x0 = 0, y0 = 0): Path =>
  (c) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i <= n; i++) {
      const d = r0 + ((r1 - r0) * i) / n;
      const o = i === 0 ? 0 : i % 2 ? amp : -amp;
      const x = (x0 + ca * d - sa * o) * r;
      const y = (y0 + sa * d + ca * o) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  };

/** Générateur pseudo-aléatoire déterministe (le dessin doit être identique à chaque appel). */
const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/** Fond sombre opaque (masque ce qui est derrière) ; absent en mode blanc pour garder le flash lisible. */
const dark = (p: Pen, color: number, t: number, alpha: number, path: Path): void => {
  if (!p.white) p.fill(deep(color, t), alpha, path);
};

/** Corps néon : fond sombre (masque ce qui est derrière) + teinte translucide + contour. */
const body = (p: Pen, color: number, path: Path, alpha = 0.22, width = 2.6, glow = 12): void => {
  dark(p, color, 0.78, 0.92, path);
  p.fill(color, alpha, path);
  p.stroke(color, width, glow, path);
};

/** Élément fin : teinte translucide + contour sans grand halo. */
const solid = (p: Pen, color: number, path: Path, alpha = 0.25, width = 2, glow = 8): void => {
  p.fill(color, alpha, path);
  p.stroke(color, width, glow, path);
};

/** Point lumineux blanc (œil, cœur, reflet). */
const spark = (p: Pen, x: number, y: number, rad: number, glow = 8): void => {
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      circle(c, rad, x, y);
    },
    glow,
  );
};

/** Trait fin sans halo, à opacité réglable (nervures, fêlures fantômes, détails secondaires). */
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

/** Noyau lumineux : halo radial, disque coloré, point blanc (le point faible du boss). */
const core = (p: Pen, r: number, color: number, k: number, x = 0, y = 0): void => {
  const c = p.ctx;
  c.save();
  c.translate(x * r, y * r);
  p.radial(color, k * r * 2.1, 0.55, 0);
  c.restore();
  p.fill(color, 0.9, disc(r, k, x, y), 14);
  p.fill(PALETTE.white, 1, disc(r, k * 0.5, x, y), 10);
};

// --- Sentinelle de la brume ----------------------------------------------------------------

function sentinel(p: Pen, r: number, col: number): void {
  const oct = ngon(r, 8, 1, Math.PI / 8);
  // Pylônes en lame aux quatre diagonales.
  const blades = all(
    ...[0, 1, 2, 3].map((i) => {
      const a = (i / 4) * TAU + Math.PI / 4;
      return local(r, 0, 0, a, shape(r, [0.78, -0.11, 1.24, 0, 0.78, 0.11]));
    }),
  );
  p.fill(col, 0.16, blades);
  p.stroke(col, 2.4, 10, blades);
  body(p, col, oct, 0.14, 3.2, 16);
  // Plaques de carapace : huit secteurs entre l'octogone et l'anneau intérieur.
  trace(
    p,
    col,
    0.55,
    1.2,
    segs(
      r,
      [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => {
        const a = (i / 8) * TAU;
        const b = a + Math.PI / 8;
        return [Math.cos(b) * 0.5, Math.sin(b) * 0.5, Math.cos(b) * 0.94, Math.sin(b) * 0.94];
      }),
    ),
  );
  p.stroke(PALETTE.violet, 2, 10, (c) => {
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU + 0.12;
      c.moveTo(Math.cos(a0) * r * 0.68, Math.sin(a0) * r * 0.68);
      c.arc(0, 0, r * 0.68, a0, a0 + Math.PI / 4 - 0.24);
    }
  });
  p.stroke(col, 2.2, 10, (c) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      c.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      c.lineTo(Math.cos(a) * r * 1.22, Math.sin(a) * r * 1.22);
    }
  });
  // Visière avant : chevron lumineux vers +x.
  solid(p, hot(col, 0.3), shape(r, [0.96, 0, 0.62, -0.22, 0.68, 0, 0.62, 0.22]), 0.5, 1.8, 10);
  // Petit octogone intérieur et noyau.
  p.stroke(col, 1.6, 6, ngon(r, 8, 0.44, 0));
  p.fill(PALETTE.magenta, 0.8, disc(r, 0.28), 14);
  p.stroke(PALETTE.magenta, 1.6, 6, disc(r, 0.28));
  spark(p, r * 0.08, 0, r * 0.11, 10);
}

// --- Arpenteur des ronces ------------------------------------------------------------------

function thornwalker(p: Pen, r: number, col: number): void {
  const bark = mix(col, 0x6a3d1a, 0.5);
  // Pattes articulées (3 paires), genou épineux, pied en griffe.
  const legs: [Pt, Pt, Pt][] = [
    [
      [0.4, 0.38],
      [0.8, 0.86],
      [1.15, 0.8],
    ],
    [
      [0.0, 0.5],
      [0.12, 1.0],
      [0.38, 1.2],
    ],
    [
      [-0.4, 0.4],
      [-0.66, 0.86],
      [-1.0, 0.92],
    ],
  ];
  for (const s of [1, -1]) {
    for (const [a, b, c2] of legs) {
      const leg = line(r, [a[0], a[1], b[0], b[1], c2[0], c2[1]], s);
      p.stroke(bark, 4, 6, leg);
      p.stroke(col, 2, 8, leg);
      // épine au genou
      solid(
        p,
        col,
        shape(r, [b[0] - 0.08, b[1] + 0.02, b[0] + 0.02, b[1] + 0.3, b[0] + 0.1, b[1] - 0.02], s),
        0.5,
        1.4,
        4,
      );
      // griffe au pied
      p.fill(
        hot(col, 0.4),
        0.9,
        shape(
          r,
          [c2[0] - 0.05, c2[1] - 0.06, c2[0] + 0.16, c2[1] + 0.04, c2[0] - 0.05, c2[1] + 0.08],
          s,
        ),
      );
    }
  }
  // Abdomen et thorax ligneux.
  const abdomen = oval(r, 0.66, 0.52, -0.3, 0);
  body(p, bark, abdomen, 0.3, 2.6, 8);
  p.stroke(col, 2, 8, abdomen);
  const thorax = oval(r, 0.46, 0.4, 0.32, 0);
  body(p, bark, thorax, 0.3, 2.6, 8);
  p.stroke(col, 2, 8, thorax);
  // Épines dorsales le long de l'abdomen.
  const spikes = all(
    ...[-2.5, -2.05, -1.6, -1.15, 1.15, 1.6, 2.05, 2.5].map((a) => {
      const bx = -0.3 + Math.cos(a) * 0.66;
      const by = Math.sin(a) * 0.52;
      return local(r, bx, by, a, shape(r, [-0.03, -0.09, 0.32, 0, -0.03, 0.09]));
    }),
  );
  solid(p, col, spikes, 0.5, 1.6, 6);
  // Stries d'écorce.
  trace(p, col, 0.45, 1.1, line(r, [-0.85, -0.2, -0.5, -0.12, -0.2, -0.22, 0.05, -0.1]));
  trace(p, col, 0.45, 1.1, line(r, [-0.85, 0.2, -0.5, 0.14, -0.2, 0.24, 0.05, 0.1]));
  // Tête : mandibules-épines et yeux.
  solid(
    p,
    col,
    shape(r, [0.66, -0.14, 1.08, -0.2, 0.86, -0.02, 1.08, 0.2, 0.66, 0.14]),
    0.4,
    2.2,
    8,
  );
  spark(p, r * 0.7, -r * 0.1, r * 0.055, 6);
  spark(p, r * 0.7, r * 0.1, r * 0.055, 6);
  // Veines de sève vers le cœur, puis cœur de sève.
  trace(p, col, 0.8, 1.4, segs(r, [0.25, 0, 0.05, 0, 0.32, 0, 0.6, 0]));
  trace(p, col, 0.7, 1.2, line(r, [0.05, 0, -0.3, -0.3, -0.62, -0.32]));
  trace(p, col, 0.7, 1.2, line(r, [0.05, 0, -0.3, 0.3, -0.62, 0.32]));
  core(p, r, col, 0.2, 0.02, 0);
}

// --- Scorpion prisme -----------------------------------------------------------------------

function prismscorpion(p: Pen, r: number, col: number): void {
  const cyan = 0x9cf0ff;
  // Queue arquée vers l'arrière : perles de cristal de plus en plus fines, dard vers +x.
  const P0: Pt = [-0.5 * r, 0];
  const P1: Pt = [-1.2 * r, 0.02 * r];
  const P2: Pt = [-1.25 * r, 0.8 * r];
  const P3: Pt = [-0.6 * r, 0.84 * r];
  const tail = (t: number): Pt => bez(P0, P1, P2, P3, t);
  p.stroke(col, 3, 6, along(tail, 0, 0.92, 24));
  for (let i = 0; i < 6; i++) {
    const t = 0.03 + i * 0.16;
    const [x, y] = tail(t);
    const [x2, y2] = tail(t + 0.03);
    const a = Math.atan2(y2 - y, x2 - x);
    const k = 0.24 - i * 0.022;
    const bead = local(1, x, y, a, shape(r * k, [1.1, 0, 0, -0.85, -1.1, 0, 0, 0.85]));
    body(p, col, bead, 0.35, 2.2, 8);
    trace(p, PALETTE.white, 0.6, 1, local(1, x, y, a, line(r * k, [-0.7, 0, 0.7, 0])));
  }
  const [sx, sy] = tail(0.98);
  const stinger = local(1, sx, sy, 0.35, shape(r, [0.46, 0, -0.02, -0.15, -0.02, 0.15]));
  p.fill(PALETTE.white, 0.9, stinger, 12);
  p.stroke(col, 1.8, 8, stinger);
  // Pattes fines (3 paires).
  for (const s of [1, -1]) {
    for (const [hx, kx, fx] of [
      [0.3, 0.55, 0.84],
      [0.0, 0.05, 0.2],
      [-0.28, -0.5, -0.8],
    ]) {
      p.stroke(col, 1.8, 6, line(r, [hx, 0.3, kx, 0.76, fx, 0.9], s));
    }
  }
  // Pinces : bras puis deux lames de cristal ouvertes vers +x.
  for (const s of [1, -1]) {
    p.stroke(col, 4, 8, line(r, [0.32, 0.3, 0.62, 0.62], s));
    const upper = shape(r, [0.5, 0.5, 1.22, 0.3, 0.92, 0.5, 0.62, 0.62], s);
    const lower = shape(r, [0.55, 0.9, 1.2, 0.88, 0.9, 0.7, 0.62, 0.68], s);
    body(p, col, upper, 0.35, 2.2, 8);
    body(p, col, lower, 0.35, 2.2, 8);
    trace(p, PALETTE.white, 0.6, 1, line(r, [0.6, 0.52, 1.14, 0.32], s));
  }
  // Carapace en cristal : cerf-volant à facettes.
  const pts = [0.9, 0, 0.38, -0.54, -0.32, -0.46, -0.66, 0, -0.32, 0.46, 0.38, 0.54];
  body(p, col, shape(r, pts), 0.26, 3, 14);
  const c0 = [0.06, 0];
  for (let i = 0; i < 6; i++) {
    const a = [pts[i * 2], pts[i * 2 + 1]];
    const j = (i + 1) % 6;
    const b = [pts[j * 2], pts[j * 2 + 1]];
    p.fill(
      i % 2 ? cyan : hot(col, 0.5),
      i % 2 ? 0.14 : 0.2,
      shape(r, [a[0], a[1], b[0], b[1], c0[0], c0[1]]),
    );
  }
  trace(
    p,
    PALETTE.white,
    0.55,
    1,
    segs(
      r,
      [
        0.06, 0, 0.9, 0, 0.06, 0, 0.38, -0.54, 0.06, 0, -0.32, 0.46, 0.06, 0, -0.66, 0, 0.06, 0,
        0.38, 0.54, 0.06, 0, -0.32, -0.46,
      ],
    ),
  );
  // Prisme central : triangle blanc et rayons décomposés.
  const prism = shape(r, [0.32, 0, -0.12, -0.21, -0.12, 0.21]);
  p.fill(PALETTE.white, 0.85, prism, 12);
  p.stroke(hot(col, 0.7), 1.6, 6, prism);
  trace(p, cyan, 0.9, 1.4, line(r, [0.32, 0, 0.66, -0.06]));
  trace(p, col, 0.9, 1.4, line(r, [0.32, 0, 0.66, 0.05]));
  trace(p, 0xfff06a, 0.9, 1.2, line(r, [0.32, 0, 0.66, 0.16]));
  spark(p, r * 0.64, -r * 0.18, r * 0.05, 6);
  spark(p, r * 0.64, r * 0.18, r * 0.05, 6);
}

// --- Colosse de verre ----------------------------------------------------------------------

function glasscolossus(p: Pen, r: number, col: number): void {
  const cyan = 0x9fe7ff;
  // Six gros cristaux hexagonaux autour du torse (couche arrière).
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const big = i === 0 ? 0.34 : 0.3;
    const x = Math.cos(a) * (i === 0 ? 0.86 : 0.8);
    const y = Math.sin(a) * (i === 0 ? 0.86 : 0.8);
    const hex = ngon(r, 6, big, a + Math.PI / 6, x, y);
    body(p, col, hex, 0.2, 2.4, 10);
    p.stroke(PALETTE.white, 0.9, 0, ngon(r, 6, big * 0.55, a + Math.PI / 6, x, y));
    trace(
      p,
      PALETTE.white,
      0.5,
      1,
      segs(r, [x - big * 0.5, y - big * 0.2, x + big * 0.1, y - big * 0.55]),
    );
  }
  // Éclats effilés entre les hexagones.
  const shards = all(
    ...[0, 1, 2, 3, 4, 5].map((i) => {
      const a = ((i + 0.5) / 6) * TAU;
      return local(r, 0, 0, a, shape(r, [0.58, -0.09, 1.22, 0, 0.58, 0.09]));
    }),
  );
  solid(p, mix(col, PALETTE.violet, 0.3), shards, 0.35, 2, 8);
  // Torse : grand hexagone à facettes et fêlures lumineuses.
  const torso = ngon(r, 6, 0.64, 0);
  body(p, col, torso, 0.22, 3.2, 14);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const b = ((i + 1) / 6) * TAU;
    p.fill(i % 2 ? cyan : PALETTE.white, i % 2 ? 0.1 : 0.14, (c) => {
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * r * 0.64, Math.sin(a) * r * 0.64);
      c.lineTo(Math.cos(b) * r * 0.64, Math.sin(b) * r * 0.64);
      c.closePath();
    });
  }
  p.stroke(col, 1.6, 6, ngon(r, 6, 0.4, Math.PI / 6));
  const cracks = all(
    crack(r, 0.5, 0.3, 0.62, 3, 0.07),
    crack(r, 2.3, 0.28, 0.6, 3, 0.07),
    crack(r, 3.9, 0.3, 0.62, 3, 0.07),
    crack(r, 5.3, 0.3, 0.6, 3, 0.07),
  );
  p.stroke(PALETTE.white, 1.6, 6, cracks);
  // Prisme central : losange blanc, rayons irisés.
  const prism = shape(r, [0.24, 0, 0, -0.24, -0.24, 0, 0, 0.24]);
  p.radial(col, r * 0.5, 0.5, 0);
  p.fill(PALETTE.white, 0.9, prism, 14);
  p.stroke(hot(col, 0.6), 1.8, 8, prism);
  trace(p, PALETTE.magenta, 0.9, 1.4, line(r, [0.24, 0, 0.5, -0.1]));
  trace(p, 0xfff06a, 0.9, 1.4, line(r, [0.24, 0, 0.54, 0.02]));
  trace(p, PALETTE.cyan, 0.9, 1.4, line(r, [0.24, 0, 0.5, 0.14]));
}

// --- Roi crabe -----------------------------------------------------------------------------

function crabking(p: Pen, r: number, col: number): void {
  const gold = 0xffd23d;
  // Pattes de marche (4 par côté) vers l'arrière.
  for (const s of [1, -1]) {
    for (const [hx, kx, fx] of [
      [0.22, 0.42, 0.62],
      [0.0, 0.05, 0.16],
      [-0.22, -0.34, -0.5],
      [-0.42, -0.64, -0.92],
    ]) {
      p.stroke(col, 2.8, 6, line(r, [hx, 0.56, kx, 0.98, fx, 1.1], s));
    }
  }
  // Énormes pinces : bras, paume, puis deux lames en croissant qui se referment vers +x.
  for (const s of [1, -1]) {
    p.stroke(deep(col, 0.4), 8, 0, line(r, [0.24, 0.5, 0.46, 0.8], s));
    p.stroke(col, 3, 8, line(r, [0.24, 0.5, 0.46, 0.8], s));
    const inner = smooth(
      r,
      [0.42, 0.5],
      [
        [0.96, 0.32, 1.26, 0.72],
        [1.0, 0.64, 0.56, 0.76],
      ],
    );
    const outer = smooth(
      r,
      [0.42, 1.08],
      [
        [0.96, 1.24, 1.26, 0.88],
        [1.0, 0.92, 0.56, 0.82],
      ],
    );
    const palm = oval(r, 0.24, 0.36, 0.5, 0.79);
    p.ctx.save();
    if (s < 0) p.ctx.scale(1, -1);
    body(p, col, palm, 0.35, 2.6, 8);
    body(p, col, inner, 0.35, 2.6, 8);
    body(p, col, outer, 0.35, 2.6, 8);
    // dents entre les lames
    p.fill(hot(col, 0.6), 0.95, shape(r, [0.98, 0.7, 1.08, 0.75, 0.94, 0.78]));
    p.fill(hot(col, 0.6), 0.95, shape(r, [0.92, 0.82, 1.06, 0.8, 0.96, 0.9]));
    trace(p, PALETTE.white, 0.55, 1, line(r, [0.5, 0.5, 0.94, 0.42, 1.16, 0.62]));
    p.ctx.restore();
  }
  // Carapace en dôme large + nervures.
  const shell = oval(r, 0.66, 0.84, 0, 0);
  body(p, col, shell, 0.24, 3, 14);
  trace(p, col, 0.55, 1.3, (c) => {
    c.moveTo(-0.55 * r, -0.45 * r);
    c.quadraticCurveTo(0, -0.05 * r, -0.55 * r, 0.45 * r);
    c.moveTo(-0.3 * r, -0.65 * r);
    c.quadraticCurveTo(0.2 * r, 0, -0.3 * r, 0.65 * r);
  });
  trace(p, col, 0.5, 1.2, line(r, [-0.05, -0.7, 0.28, -0.4, 0.34, -0.12]));
  trace(p, col, 0.5, 1.2, line(r, [-0.05, 0.7, 0.28, 0.4, 0.34, 0.12]));
  // Yeux sur tiges.
  for (const s of [1, -1]) {
    p.stroke(col, 2, 4, line(r, [0.56, 0.26, 0.86, 0.32], s));
    spark(p, r * 0.9, r * 0.32 * s, r * 0.075, 8);
  }
  // Couronne : cinq pointes dorées autour du noyau.
  const crown = (c: Ctx): void => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const d = i % 2 ? 0.2 : 0.44;
      const x = Math.cos(a) * d * r;
      const y = Math.sin(a) * d * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  dark(p, gold, 0.7, 0.95, crown);
  p.fill(gold, 0.4, crown);
  p.stroke(gold, 2.4, 10, crown);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    spark(p, Math.cos(a) * r * 0.44, Math.sin(a) * r * 0.44, r * 0.035, 4);
  }
  core(p, r, PALETTE.red, 0.13, 0, 0);
}

// --- Léviathan -----------------------------------------------------------------------------

function leviathan(p: Pen, r: number, col: number): void {
  // Corps de serpent de mer vers -x : bande sinueuse qui s'effile jusqu'à la queue.
  const spine = (t: number): Pt => [r * (0.2 - 1.45 * t), Math.sin(t * 5.2) * r * 0.2 * t];
  const half = (t: number): number => r * (0.4 - 0.34 * t);
  // Nageoires latérales (trois paires), plus petites vers la queue.
  for (const [t, len, sw] of [
    [0.1, 0.62, 0.55],
    [0.34, 0.5, 0.42],
    [0.6, 0.34, 0.3],
  ]) {
    for (const s of [1, -1]) {
      const [x, y] = spine(t);
      const h = half(t);
      const fin = shape(1, [
        x + 0.12 * r,
        y + s * h * 0.75,
        x - sw * r,
        y + s * (h + len * r),
        x - 0.3 * r,
        y + s * h * 0.95,
      ]);
      body(p, col, fin, 0.2, 2.2, 8);
      trace(
        p,
        col,
        0.6,
        1,
        segs(1, [
          x,
          y + s * h,
          x - sw * r * 0.9,
          y + s * (h + len * r * 0.95),
          x - 0.05 * r,
          y + s * h,
          x - sw * r * 0.6,
          y + s * (h + len * r * 0.6),
        ]),
      );
    }
  }
  body(p, col, ribbon(spine, half, 36), 0.2, 2.8, 12);
  // Écailles : chevrons sur le corps et ligne dorsale.
  for (let i = 1; i < 12; i++) {
    const t = i / 13;
    const [x, y] = spine(t);
    const h = half(t);
    trace(p, col, 0.65, 1.3, (c) => {
      c.moveTo(x + h * 0.3, y - h * 0.9);
      c.quadraticCurveTo(x - h * 0.6, y, x + h * 0.3, y + h * 0.9);
    });
  }
  p.stroke(hot(col, 0.3), 1.6, 6, along(spine, 0.03, 0.95));
  // Tête : crâne à crête, cornes en arrière, mâchoires ouvertes vers +x et crocs.
  for (const s of [1, -1]) {
    solid(p, col, shape(r, [0.0, 0.36, -0.5, 0.66, -0.3, 0.3], s), 0.4, 2, 8);
  }
  const skull = shape(
    r,
    [
      0.74, -0.26, 0.5, -0.46, 0.05, -0.42, -0.14, -0.2, -0.14, 0.2, 0.05, 0.42, 0.5, 0.46, 0.74,
      0.26,
    ],
  );
  body(p, col, skull, 0.26, 3, 14);
  for (const s of [1, -1]) {
    const jaw = shape(r, [0.5, 0.42, 0.98, 0.5, 1.26, 0.18, 1.04, 0.16, 0.78, 0.28, 0.6, 0.26], s);
    body(p, col, jaw, 0.3, 2.6, 10);
    for (const [x, y] of [
      [0.66, 0.27],
      [0.82, 0.25],
      [0.98, 0.2],
    ]) {
      p.fill(
        PALETTE.white,
        0.95,
        shape(r, [x - 0.06, y + 0.01, x + 0.06, y - 0.02, x - 0.01, y - 0.14], s),
      );
    }
    spark(p, r * 0.46, r * 0.3 * s, r * 0.065, 8);
    trace(p, PALETTE.white, 0.7, 1.2, line(r, [0.3, 0.4, 0.62, 0.36], s));
  }
  // Gorge lumineuse entre les mâchoires.
  p.fill(hot(col, 0.3), 0.55, shape(r, [1.08, 0, 0.74, -0.12, 0.56, 0, 0.74, 0.12]), 10);
  // Plaques du crâne et perle-noyau.
  trace(p, col, 0.6, 1.2, line(r, [-0.05, -0.3, 0.2, -0.16, 0.24, 0.16, -0.05, 0.3]));
  core(p, r, col, 0.17, 0.1, 0);
}

// --- Forgeron de cendre --------------------------------------------------------------------

function ashsmith(p: Pen, r: number, col: number): void {
  const iron = mix(col, 0x4a3a30, 0.55);
  // Cheminées dorsales et braises qui s'échappent.
  for (const s of [1, -1]) {
    solid(
      p,
      iron,
      shape(r, [-0.62, 0.2 * s, -0.86, 0.16 * s, -0.86, 0.42 * s, -0.62, 0.46 * s]),
      0.5,
      2,
      6,
    );
  }
  const rnd = rng(7);
  for (let i = 0; i < 12; i++) {
    const x = -0.95 - rnd() * 0.3;
    const y = (rnd() - 0.5) * 1.5;
    spark(p, r * x, r * y, r * (0.02 + rnd() * 0.025), 5);
  }
  // Bras droit (y-) : marteau de forge, gros bloc au bout du manche.
  p.stroke(iron, 7, 4, line(r, [0.15, -0.72, 0.62, -0.72]));
  p.stroke(col, 2.4, 6, line(r, [0.15, -0.72, 0.62, -0.72]));
  const hammer = shape(r, [0.66, -1.06, 1.06, -1.06, 1.06, -0.4, 0.66, -0.4]);
  body(p, col, hammer, 0.32, 3, 10);
  trace(p, col, 0.8, 1.4, segs(r, [0.66, -0.73, 1.06, -0.73, 0.86, -1.06, 0.86, -0.4]));
  p.fill(col, 0.5, shape(r, [1.06, -1.0, 1.16, -0.9, 1.16, -0.56, 1.06, -0.46]), 8);
  // Bras gauche (y+) : enclume portée à bout de bras.
  p.stroke(iron, 7, 4, line(r, [0.15, 0.72, 0.56, 0.78]));
  p.stroke(col, 2.4, 6, line(r, [0.15, 0.72, 0.56, 0.78]));
  const anvil = shape(
    r,
    [
      0.56, 0.62, 1.16, 0.62, 1.24, 0.8, 1.1, 0.86, 0.94, 0.86, 0.94, 1.02, 0.66, 1.02, 0.66, 0.86,
      0.56, 0.9,
    ],
  );
  body(p, col, anvil, 0.3, 2.6, 8);
  trace(p, hot(col, 0.5), 0.8, 1.2, line(r, [0.62, 0.68, 1.12, 0.68]));
  // Épaulières massives.
  for (const s of [1, -1]) {
    const pad = ngon(r, 6, 0.3, 0, 0.12, 0.72 * s);
    body(p, iron, pad, 0.4, 2.6, 8);
    p.stroke(col, 1.6, 6, pad);
    p.stroke(col, 1.2, 0, ngon(r, 6, 0.15, 0, 0.12, 0.72 * s));
  }
  // Torse cuirassé, plaques rivetées.
  const chest = shape(
    r,
    [
      0.5, -0.36, 0.56, -0.16, 0.56, 0.16, 0.5, 0.36, -0.3, 0.6, -0.62, 0.34, -0.62, -0.34, -0.3,
      -0.6,
    ],
  );
  body(p, iron, chest, 0.4, 3, 12);
  p.stroke(col, 2, 8, chest);
  trace(
    p,
    col,
    0.6,
    1.2,
    segs(r, [0.3, -0.3, 0.3, 0.3, -0.62, -0.2, -0.3, -0.24, -0.62, 0.2, -0.3, 0.24]),
  );
  for (const [x, y] of [
    [0.4, -0.26],
    [0.4, 0.26],
    [-0.4, -0.44],
    [-0.4, 0.44],
  ]) {
    spark(p, r * x, r * y, r * 0.03, 4);
  }
  // Fournaise dans la poitrine : grille, braises et noyau.
  const furnace = disc(r, 0.32, -0.08, 0);
  dark(p, col, 0.8, 1, furnace);
  p.radial(col, r * 0.7, 0.55, 0);
  p.stroke(col, 2, 8, furnace);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.26;
    trace(
      p,
      hot(col, 0.4),
      0.8,
      1.4,
      segs(r, [
        -0.08 + Math.cos(a) * 0.16,
        Math.sin(a) * 0.16,
        -0.08 + Math.cos(a) * 0.3,
        Math.sin(a) * 0.3,
      ]),
    );
  }
  core(p, r, hot(col, 0.2), 0.13, -0.08, 0);
  // Tête : heaume à fente lumineuse.
  const helm = shape(r, [0.9, 0, 0.7, -0.2, 0.4, -0.2, 0.4, 0.2, 0.7, 0.2]);
  body(p, iron, helm, 0.5, 2.6, 8);
  p.stroke(col, 2, 8, helm);
  p.fill(PALETTE.white, 1, shape(r, [0.78, -0.09, 0.78, 0.09, 0.66, 0.06, 0.66, -0.06]), 8);
}

// --- Cœur de magma -------------------------------------------------------------------------

function magmaheart(p: Pen, r: number, col: number): void {
  const lava = 0xff9a3d;
  const crust = mix(col, 0x2a0d0d, 0.6);
  const rnd = rng(11);
  // Jets de lave : langues de feu qui jaillissent entre les plaques.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const len = 1.08 + rnd() * 0.16;
    const jet = local(r, 0, 0, a, (c) => {
      c.moveTo(0.7 * r, -0.13 * r);
      c.quadraticCurveTo(0.95 * r, -0.14 * r, len * r, 0);
      c.quadraticCurveTo(0.95 * r, 0.14 * r, 0.7 * r, 0.13 * r);
      c.closePath();
    });
    p.fill(lava, 0.45, jet, 12);
    p.stroke(lava, 1.6, 8, jet);
  }
  // Lave visible entre les plaques : disque embrasé.
  dark(p, col, 0.5, 1, disc(r, 0.95));
  p.radial(lava, r, 0.7, 0.35);
  // Plaques de croûte : dix secteurs déchiquetés.
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU + 0.07;
    const a1 = ((i + 1) / N) * TAU - 0.07;
    const inner = 0.48 + rnd() * 0.06;
    const outer = 0.86 + rnd() * 0.12;
    const plate = (c: Ctx): void => {
      c.moveTo(Math.cos(a0) * inner * r, Math.sin(a0) * inner * r);
      const m = 4;
      for (let j = 0; j <= m; j++) {
        const a = a0 + ((a1 - a0) * j) / m;
        const d = (outer - (j % 2 ? 0.1 : 0)) * r;
        c.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      c.lineTo(Math.cos(a1) * inner * r, Math.sin(a1) * inner * r);
      c.closePath();
    };
    p.fill(crust, 0.96, plate);
    p.fill(col, 0.14, plate);
    p.stroke(mix(col, lava, 0.4), 2.2, 8, plate);
    trace(p, lava, 0.7, 1, crack(r, (a0 + a1) / 2, 0.55, outer - 0.12, 3, 0.05));
  }
  // Anneaux de pulsation.
  trace(p, hot(lava, 0.3), 0.5, 1.4, disc(r, 0.5), [4, 5]);
  p.stroke(col, 2.6, 12, disc(r, 0.95));
  // Cœur : chambre, veines, noyau blanc-jaune.
  const chamber = disc(r, 0.42);
  dark(p, col, 0.7, 1, chamber);
  p.radial(lava, r * 0.46, 0.95, 0.3);
  p.stroke(lava, 2.4, 12, chamber);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    trace(p, hot(lava, 0.5), 0.8, 1.3, crack(r, a, 0.18, 0.42, 2, 0.05));
  }
  p.fill(0xffe16a, 1, disc(r, 0.2), 14);
  p.fill(PALETTE.white, 1, disc(r, 0.1), 10);
}

// --- Drone amiral --------------------------------------------------------------------------

function droneadmiral(p: Pen, r: number, col: number): void {
  const steel = mix(col, 0x2a3550, 0.55);
  // Ailes en flèche, avec baies de hangar et drones à quai.
  for (const s of [1, -1]) {
    const wing = shape(r, [0.28, 0.32, -0.3, 0.98, -0.92, 1.1, -0.76, 0.5, -0.5, 0.34], s);
    body(p, col, wing, 0.22, 2.6, 10);
    trace(p, col, 0.6, 1.2, segs(r, [0.1, 0.4, -0.45, 0.62, -0.1, 0.62, -0.68, 0.84], s));
    for (const [x, y, a] of [
      [0.0, 0.62, -0.5],
      [-0.28, 0.78, -0.5],
      [-0.56, 0.94, -0.5],
    ]) {
      const bay = local(
        r,
        x,
        y * s,
        a * s,
        shape(r, [-0.13, -0.075, 0.13, -0.075, 0.13, 0.075, -0.13, 0.075]),
      );
      dark(p, col, 0.85, 1, bay);
      p.stroke(col, 1.2, 0, bay);
      const drone = local(r, x, y * s, a * s, shape(r, [0.1, 0, -0.06, -0.05, -0.06, 0.05]));
      p.fill(hot(col, 0.5), 0.95, drone, 4);
    }
    // Antennes de queue.
    p.stroke(col, 1.4, 4, line(r, [-0.92, 1.1 * 0 + 0.98 * 0 + 0.86, -1.18, 1.16 * 0 + 1.06], s));
    spark(p, r * -1.18, r * 1.06 * s, r * 0.04, 6);
  }
  // Coque effilée vers +x.
  const hull = shape(
    r,
    [
      1.16, 0, 0.72, -0.2, 0.3, -0.3, -0.5, -0.4, -0.86, -0.28, -0.86, 0.28, -0.5, 0.4, 0.3, 0.3,
      0.72, 0.2,
    ],
  );
  body(p, col, hull, 0.22, 3, 14);
  p.fill(steel, 0.6, shape(r, [0.9, 0, 0.5, -0.16, -0.7, -0.22, -0.7, 0.22, 0.5, 0.16]));
  trace(
    p,
    col,
    0.7,
    1.2,
    segs(r, [0.3, -0.3, 0.3, 0.3, -0.2, -0.38, -0.2, 0.38, -0.6, -0.36, -0.6, 0.36]),
  );
  // Paraboles et antenne avant.
  p.stroke(col, 1.8, 6, line(r, [1.16, 0, 1.3, 0]));
  spark(p, r * 1.26, 0, r * 0.035, 5);
  const dish = disc(r, 0.2, -0.42, 0);
  p.stroke(col, 1.6, 6, dish);
  trace(p, col, 0.7, 1, segs(r, [-0.42, -0.2, -0.42, 0.2, -0.62, 0, -0.22, 0]));
  // Tuyères arrière.
  for (const s of [1, -1]) {
    p.fill(
      PALETTE.white,
      0.9,
      shape(r, [-0.86, 0.12 * s, -1.0, 0.16 * s, -1.0, 0.04 * s, -0.86, 0]),
      8,
    );
    p.fill(
      col,
      0.5,
      shape(r, [-1.0, 0.16 * s, -1.16, 0.12 * s, -1.16, 0.06 * s, -1.0, 0.04 * s]),
      8,
    );
  }
  // Passerelle : dôme vitré et noyau de commandement.
  p.fill(hot(col, 0.4), 0.35, oval(r, 0.3, 0.16, 0.66, 0));
  p.stroke(col, 1.4, 4, oval(r, 0.3, 0.16, 0.66, 0));
  core(p, r, col, 0.17, 0.12, 0);
}

// --- IA gardienne --------------------------------------------------------------------------

function guardianai(p: Pen, r: number, col: number): void {
  const cyan = PALETTE.cyan;
  // Anneau extérieur en segments, nœuds de circuit.
  p.stroke(col, 2.4, 10, (c) => {
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU + 0.06;
      c.moveTo(Math.cos(a0) * r * 0.98, Math.sin(a0) * r * 0.98);
      c.arc(0, 0, r * 0.98, a0, a0 + TAU / 12 - 0.12);
    }
  });
  // Pistes de circuit à angle droit entre les deux anneaux.
  const tracks = (c: Ctx): void => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      c.moveTo(ca * r * 0.98, sa * r * 0.98);
      c.lineTo(ca * r * 0.86, sa * r * 0.86);
      const b = a + 0.16;
      c.lineTo(Math.cos(b) * r * 0.86, Math.sin(b) * r * 0.86);
      c.lineTo(Math.cos(b) * r * 0.72, Math.sin(b) * r * 0.72);
    }
  };
  trace(p, col, 0.75, 1.3, tracks);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    p.fill(col, 0.9, disc(r, 0.03, Math.cos(a) * 0.98, Math.sin(a) * 0.98), 4);
  }
  // Anneau intermédiaire : disque sombre, arcs épais tournant en sens inverse.
  dark(p, col, 0.8, 0.95, disc(r, 0.8));
  p.fill(col, 0.1, disc(r, 0.8));
  p.stroke(PALETTE.violet, 3, 10, (c) => {
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU + 0.15;
      c.moveTo(Math.cos(a0) * r * 0.74, Math.sin(a0) * r * 0.74);
      c.arc(0, 0, r * 0.74, a0, a0 + TAU / 6 - 0.5);
    }
  });
  p.stroke(col, 1.6, 6, ngon(r, 6, 0.8, 0));
  // Œil : amande, iris à rayons, pupille en losange tournée vers +x.
  const almond = (c: Ctx): void => {
    c.moveTo(-0.66 * r, 0);
    c.quadraticCurveTo(0, -0.95 * r, 0.66 * r, 0);
    c.quadraticCurveTo(0, 0.95 * r, -0.66 * r, 0);
    c.closePath();
  };
  dark(p, col, 0.85, 1, almond);
  p.fill(col, 0.18, almond);
  p.stroke(col, 3, 12, almond);
  const iris = disc(r, 0.32, 0.1, 0);
  p.fill(col, 0.5, iris, 12);
  p.stroke(hot(col, 0.4), 2, 8, iris);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    trace(
      p,
      hot(col, 0.6),
      0.6,
      1,
      segs(r, [
        0.1 + Math.cos(a) * 0.17,
        Math.sin(a) * 0.17,
        0.1 + Math.cos(a) * 0.3,
        Math.sin(a) * 0.3,
      ]),
    );
  }
  const pupil = shape(r, [0.34, 0, 0.1, -0.14, -0.06, 0, 0.1, 0.14]);
  p.fill(PALETTE.white, 1, pupil, 12);
  p.stroke(cyan, 1.2, 6, pupil);
  // Satellites : quatre nacelles reliées à l'anneau.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const x = Math.cos(a) * 1.12;
    const y = Math.sin(a) * 1.12;
    const sat = ngon(r, 4, 0.13, a, x, y);
    body(p, col, sat, 0.4, 2, 8);
    spark(p, r * x, r * y, r * 0.035, 5);
  }
}

// --- Yéti ancien ---------------------------------------------------------------------------

function elderyeti(p: Pen, r: number, col: number): void {
  const ice = 0x7fe8ff;
  const fur = mix(col, 0x39507a, 0.55);
  const bone = 0xfff2d6;
  // Cristaux de glace plantés dans le dos.
  const crystals = all(
    ...[2.5, 2.85, 3.4, 3.8].map((a, i) => {
      const len = i % 2 ? 1.12 : 1.24;
      return local(r, 0, 0, a, shape(r, [0.55, -0.12, len, 0, 0.55, 0.12]));
    }),
  );
  solid(p, ice, crystals, 0.4, 2, 8);
  // Fourrure : contour dentelé à deux couches (silhouette déterministe).
  const N = 16;
  const furPath =
    (rad: number, amp: number, off = 0, seed = 3, n = N): Path =>
    (c) => {
      const rnd = rng(seed);
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * TAU + off;
        const d = rad + (i % 2 ? -amp : amp * 0.6) + (rnd() - 0.5) * amp * 0.5;
        const x = Math.cos(a) * d * r;
        const y = Math.sin(a) * d * r;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
    };
  // Poings massifs devant, bras épais.
  for (const s of [1, -1]) {
    p.stroke(fur, 9, 0, line(r, [-0.1, 0.62, 0.5, 0.9], s));
    p.stroke(col, 2, 6, line(r, [-0.1, 0.62, 0.5, 0.9], s));
    const fist = local(r, 0.74, 0.92 * s, 0, furPath(0.3, 0.07, s, 6, 8));
    body(p, col, fist, 0.3, 2.4, 8);
    p.stroke(ice, 1.6, 6, ngon(r, 5, 0.13, 0.4, 0.74, 0.92 * s));
    p.fill(ice, 0.35, ngon(r, 5, 0.13, 0.4, 0.74, 0.92 * s));
  }
  const outer = local(r, -0.15, 0, 0, furPath(0.86, 0.12));
  body(p, col, outer, 0.2, 3, 12);
  const inner = local(r, -0.15, 0, 0, furPath(0.6, 0.1, 0.06, 9));
  p.fill(fur, 0.55, inner);
  p.stroke(col, 1.6, 6, inner);
  // Mèches de fourrure sur le dos.
  const rnd2 = rng(19);
  trace(
    p,
    col,
    0.5,
    1.1,
    all(
      ...Array.from({ length: 10 }, (_, i) => {
        const a = 1.7 + (i / 9) * 2.8;
        const d0 = 0.3 + rnd2() * 0.1;
        return segs(r, [
          -0.15 + Math.cos(a) * d0,
          Math.sin(a) * d0,
          -0.15 + Math.cos(a + 0.14) * (d0 + 0.22),
          Math.sin(a + 0.14) * (d0 + 0.22),
        ]);
      }),
    ),
  );
  // Cœur de glace : cristal hexagonal dans le dos.
  const heart = ngon(r, 6, 0.2, Math.PI / 6, -0.4, 0);
  p.radial(ice, r * 0.5, 0.4, 0);
  p.fill(ice, 0.55, heart, 12);
  p.stroke(hot(ice, 0.5), 1.8, 8, heart);
  spark(p, r * -0.4, 0, r * 0.07, 8);
  // Cornes courbes vers l'avant.
  for (const s of [1, -1]) {
    const P0: Pt = [0.42 * r, 0.22 * s * r];
    const P1: Pt = [0.58 * r, 0.7 * s * r];
    const P2: Pt = [1.0 * r, 0.56 * s * r];
    const P3: Pt = [1.22 * r, 0.7 * s * r];
    const horn = ribbon(
      (t) => bez(P0, P1, P2, P3, t),
      (t) => r * (0.12 - 0.11 * t),
      18,
    );
    p.fill(bone, 0.85, horn);
    p.stroke(bone, 1.8, 8, horn);
  }
  // Tête : masque de fourrure, yeux glacés, crocs.
  const head = local(r, 0.5, 0, 0, furPath(0.34, 0.06, 0.2, 13, 10));
  body(p, fur, head, 0.5, 2.4, 8);
  p.stroke(col, 1.6, 6, head);
  for (const s of [1, -1]) {
    p.fill(ice, 1, disc(r, 0.075, 0.6, 0.14 * s), 8);
    spark(p, r * 0.62, r * 0.14 * s, r * 0.035, 4);
  }
  p.stroke(
    PALETTE.white,
    1.6,
    4,
    line(r, [0.68, -0.1, 0.72, 0.0, 0.76, -0.1, 0.8, 0.0, 0.84, -0.1]),
  );
  p.fill(bone, 1, shape(r, [0.68, -0.02, 0.72, 0.1, 0.7, 0.02]));
  p.fill(bone, 1, shape(r, [0.68, 0.02, 0.72, -0.1, 0.7, -0.02]));
}

// --- Wyrm de givre -------------------------------------------------------------------------

function frostwyrm(p: Pen, r: number, col: number): void {
  // Ailes cristallines : bras, doigts, membrane facettée.
  for (const s of [1, -1]) {
    const tips: Pt[] = [
      [-0.95, 1.2],
      [-1.2, 0.86],
      [-1.15, 0.4],
    ];
    const wrist: Pt = [-0.15, 1.0];
    const membrane = shape(
      r,
      [
        0.2,
        0.3,
        wrist[0],
        wrist[1],
        tips[0][0],
        tips[0][1],
        tips[1][0],
        tips[1][1],
        tips[2][0],
        tips[2][1],
        -0.5,
        0.25,
      ],
      s,
    );
    body(p, col, membrane, 0.2, 2.4, 10);
    for (const [i, t] of tips.entries()) {
      p.stroke(col, 2 - i * 0.2, 6, line(r, [wrist[0], wrist[1], t[0], t[1]], s));
      if (i < 2) {
        p.fill(
          hot(col, 0.5),
          0.14,
          shape(r, [wrist[0], wrist[1], t[0], t[1], tips[i + 1][0], tips[i + 1][1]], s),
        );
      }
    }
    p.stroke(col, 3, 8, line(r, [0.12, 0.3, wrist[0], wrist[1]], s));
    trace(p, PALETTE.white, 0.5, 1, segs(r, [-0.15, 0.62, -0.7, 0.75, -0.3, 0.45, -0.85, 0.5], s));
  }
  // Corps : bande effilée vers -x, dents dorsales, plaques de givre.
  const spine = (t: number): Pt => [r * (0.55 - 1.45 * t), Math.sin(t * 5) * r * 0.1 * t];
  const half = (t: number): number => r * (0.3 - 0.26 * t);
  body(p, col, ribbon(spine, half, 32), 0.22, 2.8, 12);
  for (let i = 0; i < 11; i++) {
    const t = 0.06 + i * 0.08;
    const [x, y] = spine(t);
    const h = half(t);
    p.fill(
      hot(col, 0.5),
      0.8,
      shape(1, [x + 0.2 * r * 0.15, y - h * 0.9, x - r * 0.1, y, x + r * 0.05, y + h * 0.9]),
    );
    trace(p, col, 0.6, 1.1, (c) => {
      c.moveTo(x + h * 0.3, y - h * 0.9);
      c.quadraticCurveTo(x - h * 0.4, y, x + h * 0.3, y + h * 0.9);
    });
  }
  // Pointe de queue en cristal.
  const [tx, ty] = spine(1);
  solid(
    p,
    hot(col, 0.3),
    shape(1, [
      tx + 0.02 * r,
      ty,
      tx - 0.2 * r,
      ty - 0.12 * r,
      tx - 0.3 * r,
      ty,
      tx - 0.2 * r,
      ty + 0.12 * r,
    ]),
    0.4,
    2,
    8,
  );
  // Tête : museau allongé, cornes en arrière, mâchoire, yeux.
  for (const s of [1, -1]) {
    solid(p, col, shape(r, [0.62, 0.22, 0.34, 0.5, 0.05, 0.62, 0.3, 0.3], s), 0.45, 2.2, 8);
  }
  const head = shape(
    r,
    [1.24, 0, 1.0, -0.14, 0.7, -0.26, 0.42, -0.22, 0.34, 0, 0.42, 0.22, 0.7, 0.26, 1.0, 0.14],
  );
  body(p, col, head, 0.28, 2.8, 12);
  trace(p, PALETTE.white, 0.7, 1.2, line(r, [1.2, -0.02, 0.86, -0.02, 0.6, 0]));
  trace(p, hot(col, 0.6), 0.9, 1.2, line(r, [1.1, 0.1, 1.0, 0.04, 0.94, 0.12, 0.86, 0.06]));
  spark(p, r * 0.66, -r * 0.16, r * 0.05, 8);
  spark(p, r * 0.66, r * 0.16, r * 0.05, 8);
  // Cristal de givre à la poitrine : point faible.
  const gem = ngon(r, 6, 0.2, 0, 0.14, 0);
  p.radial(col, r * 0.5, 0.5, 0);
  p.fill(col, 0.6, gem, 12);
  p.stroke(hot(col, 0.5), 1.8, 8, gem);
  spark(p, r * 0.14, 0, r * 0.075, 8);
}

// --- Hydre putride -------------------------------------------------------------------------

function rothydra(p: Pen, r: number, col: number): void {
  const sick = 0xd6ff5a;
  // Cous : trois bandes courbes vers +x.
  const heads: { P: Pt[]; hx: number; hy: number; a: number }[] = [
    {
      P: [
        [-0.1, 0],
        [0.3, 0],
        [0.7, 0],
        [0.95, 0],
      ],
      hx: 0.95,
      hy: 0,
      a: 0,
    },
    {
      P: [
        [-0.2, -0.3],
        [0.1, -0.75],
        [0.5, -0.4],
        [0.78, -0.68],
      ],
      hx: 0.78,
      hy: -0.68,
      a: -0.5,
    },
    {
      P: [
        [-0.2, 0.3],
        [0.1, 0.75],
        [0.5, 0.4],
        [0.78, 0.68],
      ],
      hx: 0.78,
      hy: 0.68,
      a: 0.5,
    },
  ];
  for (const h of heads) {
    const [a, b, c2, d] = h.P.map((q): Pt => [q[0] * r, q[1] * r]);
    const neck = ribbon(
      (t) => bez(a, b, c2, d, t),
      (t) => r * (0.2 - 0.06 * t),
      20,
    );
    body(p, col, neck, 0.28, 2.4, 8);
    trace(
      p,
      col,
      0.6,
      1.1,
      along((t) => bez(a, b, c2, d, t), 0.05, 0.9),
    );
  }
  // Corps bulbeux : trois lobes, pustules.
  const lobes = all(
    disc(r, 0.55, -0.45, 0),
    disc(r, 0.36, -0.6, -0.42),
    disc(r, 0.36, -0.6, 0.42),
    disc(r, 0.3, -0.1, -0.26),
    disc(r, 0.3, -0.1, 0.26),
  );
  body(p, col, lobes, 0.26, 3, 12);
  const rnd = rng(23);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU;
    const d = 0.2 + rnd() * 0.42;
    const x = -0.5 + Math.cos(a) * d;
    const y = Math.sin(a) * d * 0.9;
    const rad = 0.06 + rnd() * 0.06;
    p.fill(sick, 0.35, disc(r, rad, x, y), 8);
    p.stroke(sick, 1.4, 4, disc(r, rad, x, y));
    spark(p, r * (x - rad * 0.25), r * (y - rad * 0.25), r * rad * 0.3, 3);
  }
  // Têtes : crâne, deux mâchoires, crocs, yeux.
  for (const h of heads) {
    const R = r * 1.2;
    const at = (path: Path): Path => local(r, h.hx, h.hy, h.a, path);
    const skull = at(
      shape(R, [-0.16, -0.17, 0.08, -0.2, 0.2, -0.05, 0.2, 0.05, 0.08, 0.2, -0.16, 0.17]),
    );
    body(p, col, skull, 0.4, 2.4, 8);
    const jawU = at(shape(R, [0.05, -0.2, 0.36, -0.15, 0.16, -0.04]));
    const jawL = at(shape(R, [0.05, 0.2, 0.36, 0.15, 0.16, 0.04]));
    solid(p, col, jawU, 0.5, 1.6, 6);
    solid(p, col, jawL, 0.5, 1.6, 6);
    p.fill(PALETTE.white, 0.95, at(shape(R, [0.22, -0.12, 0.28, -0.05, 0.18, -0.06])));
    p.fill(PALETTE.white, 0.95, at(shape(R, [0.22, 0.12, 0.28, 0.05, 0.18, 0.06])));
    p.fill(sick, 1, at(disc(R, 0.03, 0.02, -0.1)), 6);
    p.fill(sick, 1, at(disc(R, 0.03, 0.02, 0.1)), 6);
  }
  // Noyau : poche de bile toxique.
  core(p, r, sick, 0.17, -0.45, 0);
}

// --- Reine des marais ----------------------------------------------------------------------

function bogqueen(p: Pen, r: number, col: number): void {
  const gold = 0xffd23d;
  // Ailes membraneuses : grandes ailes avant et petites ailes arrière, avec nervures.
  for (const s of [1, -1]) {
    const big = smooth(
      r,
      [0.15, 0.2],
      [
        [0.1, 0.9, -0.5, 1.22, -0.7, 1.05],
        [-1.0, 0.7, -0.9, 0.3, -0.4, 0.2],
      ],
      1,
      s,
    );
    p.fill(col, 0.14, big);
    p.stroke(col, 2, 10, big);
    trace(
      p,
      col,
      0.6,
      1,
      segs(
        r,
        [
          0.1, 0.24, -0.6, 1.02, 0.05, 0.26, -0.3, 1.08, 0.0, 0.24, -0.9, 0.6, -0.05, 0.22, -0.8,
          0.34,
        ],
        s,
      ),
    );
    const small = smooth(
      r,
      [-0.2, 0.22],
      [
        [-0.6, 0.7, -1.05, 0.72, -1.14, 0.5],
        [-1.1, 0.24, -0.7, 0.2, -0.4, 0.2],
      ],
      1,
      s,
    );
    p.fill(col, 0.1, small);
    p.stroke(col, 1.6, 8, small);
  }
  // Pattes fines.
  for (const s of [1, -1]) {
    for (const [x, y, fx, fy] of [
      [0.2, 0.2, 0.6, 0.62],
      [0.05, 0.24, 0.1, 0.8],
      [-0.1, 0.24, -0.4, 0.74],
    ]) {
      p.stroke(col, 1.6, 4, line(r, [x, y, (x + fx) / 2 + 0.06, fy - 0.1, fx, fy], s));
    }
  }
  // Abdomen-couvain : grand sac segmenté rempli d'œufs lumineux.
  const abdomen = oval(r, 0.68, 0.46, -0.62, 0);
  body(p, col, abdomen, 0.22, 3, 12);
  trace(p, col, 0.55, 1.1, (c) => {
    for (const x of [-0.3, -0.62, -0.94]) {
      c.moveTo(x * r, -0.4 * r * Math.sqrt(Math.max(0, 1 - ((x + 0.62) / 0.68) ** 2)));
      c.quadraticCurveTo(
        (x - 0.08) * r,
        0,
        x * r,
        0.4 * r * Math.sqrt(Math.max(0, 1 - ((x + 0.62) / 0.68) ** 2)),
      );
    }
  });
  const eggs: Pt[] = [
    [-0.42, -0.2],
    [-0.42, 0.2],
    [-0.74, -0.24],
    [-0.74, 0.24],
    [-0.98, -0.1],
    [-0.98, 0.1],
    [-0.62, 0],
  ];
  for (const [x, y] of eggs) {
    p.fill(PALETTE.violet, 0.45, disc(r, 0.075, x, y), 6);
    p.stroke(hot(col, 0.4), 1.2, 3, disc(r, 0.075, x, y));
  }
  core(p, r, PALETTE.magenta, 0.11, -0.62, 0);
  // Thorax et tête.
  body(p, col, oval(r, 0.3, 0.27, 0.06, 0), 0.3, 2.6, 8);
  const head = oval(r, 0.2, 0.22, 0.52, 0);
  body(p, col, head, 0.3, 2.6, 8);
  // Mandibules en pinces, antennes.
  for (const s of [1, -1]) {
    solid(p, col, shape(r, [0.62, 0.1, 0.94, 0.16, 0.84, 0.03], s), 0.5, 1.8, 6);
    p.stroke(col, 1.4, 4, line(r, [0.66, 0.16, 0.9, 0.44, 1.14, 0.5], s));
    p.fill(PALETTE.red, 1, disc(r, 0.06, 0.58, 0.14 * s), 8);
    spark(p, r * 0.57, r * 0.13 * s, r * 0.025, 3);
  }
  // Couronne dorée : cercle à huit pointes posé sur la tête.
  const crown = (c: Ctx): void => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const d = i % 2 ? 0.17 : 0.3;
      const x = (0.4 + Math.cos(a) * d) * r;
      const y = Math.sin(a) * d * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  p.fill(gold, 0.18, crown);
  p.stroke(gold, 1.8, 8, crown);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    spark(p, (0.4 + Math.cos(a) * 0.3) * r, Math.sin(a) * 0.3 * r, r * 0.022, 3);
  }
  p.fill(PALETTE.red, 1, disc(r, 0.05, 0.4, 0), 8);
}

// --- Séraphin gardien ----------------------------------------------------------------------

function seraphwarden(p: Pen, r: number, col: number): void {
  const white = 0xfffaf0;
  // Ailes : deux rangées d'éventails de plumes, balayées vers l'arrière depuis l'épaule.
  for (const s of [1, -1]) {
    for (const [rows, len0, w0] of [
      [0, 0.86, 0.1],
      [1, 0.6, 0.08],
    ]) {
      for (let k = 0; k < 6; k++) {
        const a = s * (Math.PI / 2 - 0.35 + k * 0.34 + rows * 0.17);
        const len = len0 - k * 0.03;
        const w = w0 + 0.006 * k;
        const ox = 0.05;
        const oy = 0.34 * s;
        const feather = local(
          r,
          ox,
          oy,
          a,
          shape(r, [0.0, -w * 0.5, len * 0.55, -w, len, 0, len * 0.55, w, 0.0, w * 0.5]),
        );
        dark(p, col, 0.7, 0.9, feather);
        p.fill(col, rows ? 0.26 : 0.2, feather);
        p.stroke(col, rows ? 1.5 : 1.9, 8, feather);
        trace(p, PALETTE.white, 0.5, 0.9, local(r, ox, oy, a, line(r, [0.05, 0, len * 0.75, 0])));
      }
    }
  }
  // Anneaux d'ailes : arcs brisés sur deux rayons, tournant à contre-sens.
  p.stroke(col, 3, 12, (c) => {
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * TAU + 0.35;
      c.moveTo(Math.cos(a0) * r * 0.66, Math.sin(a0) * r * 0.66);
      c.arc(0, 0, r * 0.66, a0, a0 + TAU / 4 - 0.7);
    }
  });
  // Corps central : disque sombre, halo de lumière.
  dark(p, col, 0.8, 0.95, disc(r, 0.5));
  p.radial(col, r * 0.55, 0.32, 0.04);
  p.stroke(col, 2.4, 10, disc(r, 0.5));
  p.stroke(white, 2, 8, (c) => {
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * TAU + 0.5;
      c.moveTo(Math.cos(a0) * r * 0.4, Math.sin(a0) * r * 0.4);
      c.arc(0, 0, r * 0.4, a0, a0 + TAU / 3 - 0.7);
    }
  });
  // Halo : anneau incliné au-dessus de l'œil, vers +x.
  p.stroke(white, 2.4, 12, oval(r, 0.16, 0.44, 0.5, 0));
  // Œil : amande, iris, pupille.
  const almond = (c: Ctx): void => {
    c.moveTo(-0.34 * r, 0);
    c.quadraticCurveTo(0, -0.5 * r, 0.34 * r, 0);
    c.quadraticCurveTo(0, 0.5 * r, -0.34 * r, 0);
    c.closePath();
  };
  p.fill(white, 0.35, almond);
  p.stroke(white, 1.8, 8, almond);
  core(p, r, hot(col, 0.2), 0.12, 0.06, 0);
}

// --- Archonte du vide ----------------------------------------------------------------------

function voidarchon(p: Pen, r: number, col: number): void {
  const magenta = PALETTE.magenta;
  // Tentacules : quatre vers l'arrière, deux bras avant en pince.
  const limbs: { a: number; len: number; bend: number; w: number }[] = [
    { a: Math.PI - 0.5, len: 1.22, bend: 0.5, w: 0.15 },
    { a: Math.PI + 0.5, len: 1.22, bend: -0.5, w: 0.15 },
    { a: Math.PI - 1.35, len: 1.16, bend: -0.4, w: 0.14 },
    { a: Math.PI + 1.35, len: 1.16, bend: 0.4, w: 0.14 },
    { a: 0.75, len: 1.14, bend: -0.55, w: 0.14 },
    { a: -0.75, len: 1.14, bend: 0.55, w: 0.14 },
  ];
  for (const l of limbs) {
    const ca = Math.cos(l.a);
    const sa = Math.sin(l.a);
    const spine = (t: number): Pt => {
      const d = (0.4 + (l.len - 0.4) * t) * r;
      const off = Math.sin(t * Math.PI * 1.6) * l.bend * 0.28 * r * t * 1.6;
      return [ca * d - sa * off, sa * d + ca * off];
    };
    const limb = ribbon(spine, (t) => r * l.w * (1 - 0.92 * t), 24);
    body(p, col, limb, 0.3, 2.2, 8);
    trace(p, magenta, 0.6, 1, along(spine, 0.15, 0.9));
    const [tx, ty] = spine(1);
    spark(p, tx, ty, r * 0.035, 6);
  }
  // Couronne d'éclats : douze pointes en alternance longue / courte.
  const crown = all(
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * TAU + Math.PI / 12;
      const long = i % 2 === 0;
      return local(
        r,
        0,
        0,
        a,
        shape(r, [0.5, long ? -0.075 : -0.06, long ? 1.02 : 0.86, 0, 0.5, long ? 0.075 : 0.06]),
      );
    }),
  );
  dark(p, col, 0.7, 0.95, crown);
  p.fill(col, 0.28, crown);
  p.stroke(col, 2.2, 12, crown);
  // Disque d'accrétion : anneaux colorés autour du trou noir.
  dark(p, col, 0.85, 1, disc(r, 0.52));
  p.stroke(col, 2.4, 10, disc(r, 0.52));
  p.stroke(magenta, 2.6, 10, oval(r, 0.5, 0.2, 0, 0, -0.35));
  trace(p, hot(col, 0.6), 0.8, 1.2, oval(r, 0.5, 0.2, 0, 0, 0.35), [5, 4]);
  trace(p, PALETTE.cyan, 0.6, 1, disc(r, 0.42), [2, 5]);
  // Trou noir : disque sombre serti d'un bord lumineux.
  const hole = disc(r, 0.27);
  p.fill(PALETTE.voidDeep, 1, hole);
  p.stroke(hot(col, 0.5), 2, 10, hole);
  spark(p, r * 0.05, 0, r * 0.05, 8);
}

// --- Générique -----------------------------------------------------------------------------

/** Octogone à noyau : filet de sécurité pour un boss sans dessin propre. */
function generic(p: Pen, r: number, col: number): void {
  const oct = ngon(r, 8, 1, Math.PI / 8);
  body(p, col, oct, 0.16, 3, 14);
  p.stroke(col, 2, 8, ngon(r, 8, 0.62, 0));
  core(p, r, col, 0.2);
}

/** Dessine le boss `def` (origine au centre, avant vers +x) avec le crayon `p`. */
export function drawBossArt(p: Pen, def: BossDef): void {
  const r = def.radius;
  const col = colorOf(def.color);
  switch (def.id) {
    case 'sentinel':
      sentinel(p, r, col);
      break;
    case 'thornwalker':
      thornwalker(p, r, col);
      break;
    case 'prismscorpion':
      prismscorpion(p, r, col);
      break;
    case 'glasscolossus':
      glasscolossus(p, r, col);
      break;
    case 'crabking':
      crabking(p, r, col);
      break;
    case 'leviathan':
      leviathan(p, r, col);
      break;
    case 'ashsmith':
      ashsmith(p, r, col);
      break;
    case 'magmaheart':
      magmaheart(p, r, col);
      break;
    case 'droneadmiral':
      droneadmiral(p, r, col);
      break;
    case 'guardianai':
      guardianai(p, r, col);
      break;
    case 'elderyeti':
      elderyeti(p, r, col);
      break;
    case 'frostwyrm':
      frostwyrm(p, r, col);
      break;
    case 'rothydra':
      rothydra(p, r, col);
      break;
    case 'bogqueen':
      bogqueen(p, r, col);
      break;
    case 'seraphwarden':
      seraphwarden(p, r, col);
      break;
    case 'voidarchon':
      voidarchon(p, r, col);
      break;
    default:
      generic(p, r, col);
      break;
  }
}
