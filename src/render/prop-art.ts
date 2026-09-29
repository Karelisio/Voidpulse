/**
 * Décors d'événement dessinés en Canvas2D (vectoriel néon), vus de dessus, origine au centre de
 * la cellule d'atlas : marchand ambulant (72 × 72), autel de sacrifice, faille temporelle
 * (96 × 96), pièce d'or (20 × 20) et monticule d'un ver enfoui (48 × 48). Tout, halo compris,
 * tient dans le rayon indiqué pour chaque cellule. Seul le crayon (Pen) pose de la couleur.
 */
import { PALETTE, mix } from './palette';
import { circle, poly, type Ctx, type Pen } from './pen';

type Path = (c: Ctx) => void;

const TAU = Math.PI * 2;

const hot = (color: number, t = 0.55): number => mix(color, PALETTE.white, t);
const deep = (color: number, t = 0.6): number => mix(color, PALETTE.void, t);

/** Disque de rayon rad centré en (x, y). */
const disc =
  (rad: number, x = 0, y = 0): Path =>
  (c) => {
    circle(c, rad, x, y);
  };

/** Trait fin sans halo, à opacité réglable (nervures, rigoles, détails secondaires). */
const trace = (p: Pen, color: number, alpha: number, width: number, path: Path): void => {
  const c = p.ctx;
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = p.col(color, alpha);
  c.lineWidth = width;
  c.beginPath();
  path(c);
  c.stroke();
  c.restore();
};

/** Point lumineux blanc. */
const spark = (p: Pen, x: number, y: number, rad: number, glow = 6): void => {
  p.fill(PALETTE.white, 1, disc(rad, x, y), glow);
};

// --- Marchand ambulant : nacelle hexagonale, auvent rayé, pièce ------------------------------

export function drawMerchant(p: Pen): void {
  const cyan = PALETTE.cyan;
  const gold = PALETTE.yellow;
  const pink = PALETTE.magenta;
  const tilt = Math.PI / 6;
  // Nacelle : socle sombre et contour cyan.
  const pod: Path = (c) => {
    poly(c, 6, 26, tilt);
  };
  p.fill(deep(cyan, 0.78), 0.9, pod);
  p.stroke(cyan, 2.4, 10, pod);
  // Auvent : six secteurs rayés jaune / rose, convergeant vers le mât central.
  for (let i = 0; i < 6; i++) {
    const a0 = tilt + (i / 6) * TAU;
    const a1 = a0 + TAU / 6;
    p.fill(i % 2 ? pink : gold, 0.36, (c) => {
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a0) * 22, Math.sin(a0) * 22);
      c.lineTo(Math.cos(a1) * 22, Math.sin(a1) * 22);
      c.closePath();
    });
  }
  trace(p, hot(cyan, 0.5), 0.7, 1.3, (c) => {
    poly(c, 6, 22, tilt);
    for (let i = 0; i < 6; i++) {
      const a = tilt + (i / 6) * TAU;
      c.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
      c.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
    }
  });
  // Lampions aux six sommets.
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      for (let i = 0; i < 6; i++) {
        const a = tilt + (i / 6) * TAU;
        circle(c, 1.9, Math.cos(a) * 26, Math.sin(a) * 26);
      }
    },
    7,
  );
  // Pièce d'or au centre : disque, anneau et « S » barré.
  p.fill(gold, 0.95, disc(9), 11);
  p.stroke(hot(gold, 0.45), 1.6, 5, disc(9));
  const sign = deep(gold, 0.82);
  trace(p, sign, 0.95, 1.9, (c) => {
    c.moveTo(3, -3.2);
    c.bezierCurveTo(-0.6, -6.2, -4.4, -1.6, -0.2, 0.2);
    c.bezierCurveTo(4.2, 2, 0.8, 6.4, -3, 3.4);
    c.moveTo(0, -5.6);
    c.lineTo(0, 5.6);
  });
}

// --- Autel de sacrifice : anneau de runes rouge sang, coupe et flamme ------------------------

/** Glyphes runiques : polylignes dans une boîte de ±2,6 (tangente) × ±3,6 (radial). */
const RUNES: number[][][] = [
  [
    [0, 3.6, 0, -3.6],
    [-2.6, -2, 0, 0.6, 2.6, -2],
  ],
  [
    [-1.5, 3.6, -1.5, -3.6, 2, -1.8, -1.5, 0.2],
    [-1.5, 0.2, 2, 1.8],
  ],
  [
    [-1.5, -3.6, -1.5, 3.6],
    [-1.5, -2.2, 1.9, 0, -1.5, 2.2],
  ],
  [[0, -3.6, 2.6, 0, 0, 3.6, -2.6, 0, 0, -3.6]],
  [
    [-2.4, -3.6, 2.4, 3.6],
    [2.4, -3.6, -2.4, 3.6],
  ],
  [[-2.2, -3.6, 2.2, -1.2, -2.2, 1.2, 2.2, 3.6]],
  [[0, -3.6, 2.6, 3, -2.6, 3, 0, -3.6]],
  [
    [0, -3.6, 0, 3.6],
    [-2.6, 0, 2.6, 0],
  ],
];

export function drawAltar(p: Pen): void {
  const red = 0xff3d5a;
  // Halo diffus au sol et double anneau extérieur.
  p.radial(red, 44, 0.16, 0);
  p.stroke(red, 2.2, 10, disc(38));
  trace(p, red, 0.6, 1.2, disc(30.5));
  // Douze runes gravées entre les deux anneaux.
  p.stroke(red, 1.5, 6, (c) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.save();
      c.translate(Math.cos(a) * 34.3, Math.sin(a) * 34.3);
      c.rotate(a + Math.PI / 2);
      for (const stroke of RUNES[i % RUNES.length]) {
        c.moveTo(stroke[0] * 0.9, stroke[1] * 0.9);
        for (let k = 2; k < stroke.length; k += 2) c.lineTo(stroke[k] * 0.9, stroke[k + 1] * 0.9);
      }
      c.restore();
    }
  });
  // Plateau de pierre et rigoles de sang vers la coupe.
  p.fill(red, 0.15, disc(29));
  trace(p, red, 0.5, 1.2, disc(29));
  trace(p, red, 0.6, 1.5, (c) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      c.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
      c.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
    }
  });
  // Quatre cierges aux points cardinaux.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const x = Math.cos(a) * 29;
    const y = Math.sin(a) * 29;
    p.fill(red, 0.5, disc(3.2, x, y));
    p.stroke(red, 1.6, 6, disc(3.2, x, y));
    p.fill(PALETTE.yellow, 1, disc(1.5, x, y), 6);
  }
  // Coupe centrale.
  p.fill(deep(red, 0.6), 0.95, disc(13));
  p.stroke(red, 2.6, 10, disc(13));
  p.stroke(hot(red, 0.3), 1.4, 5, disc(9));
  // Flamme : langue orange, cœur jaune, point blanc.
  const flame =
    (k: number, dy: number): Path =>
    (c) => {
      c.moveTo(0, 6 * k + dy);
      c.bezierCurveTo(-6.5 * k, 5 * k + dy, -7 * k, -1 * k + dy, -1.5 * k, -6.5 * k + dy);
      c.bezierCurveTo(-1.6 * k, -3.2 * k + dy, -0.2 * k, -2.6 * k + dy, 0.6 * k, -11 * k + dy);
      c.bezierCurveTo(2.6 * k, -6.4 * k + dy, 7 * k, -3.4 * k + dy, 6.2 * k, 1.6 * k + dy);
      c.bezierCurveTo(5.6 * k, 4.8 * k + dy, 3 * k, 6 * k + dy, 0, 6 * k + dy);
      c.closePath();
    };
  p.fill(PALETTE.orange, 0.85, flame(1, -1), 10);
  p.fill(PALETTE.yellow, 0.95, flame(0.6, 0.6));
  spark(p, 0, 1.5, 1.7, 6);
}

// --- Faille temporelle : déchirure verticale tourbillonnante ---------------------------------

export function drawRift(p: Pen): void {
  const violet = 0xb36bff;
  const cyan = 0x6af0ff;
  const RX = 12;
  const RY = 34;
  const c0 = p.ctx;
  // Halo elliptique diffus autour de la déchirure.
  c0.save();
  c0.scale(0.4, 1);
  p.radial(violet, 46, 0.4, 0);
  c0.restore();
  // Contour de la déchirure : lentille pointue aux extrémités, bords irréguliers (pseudo-aléa
  // déterministe). Les points sont calculés une fois : remplissage et bords coïncident.
  const N = 52;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * TAU;
    const cs = Math.cos(t);
    const hash = ((i * 37) % 11) / 11;
    const jag = 1 + (hash - 0.4) * 0.16 + (i % 2 ? 0.03 : -0.03);
    pts.push([Math.sign(cs) * Math.pow(Math.abs(cs), 0.8) * RX * jag, Math.sin(t) * RY * jag]);
  }
  const trail =
    (from: number, to: number): Path =>
    (c) => {
      for (let i = from; i <= to; i++) {
        const [x, y] = pts[((i % N) + N) % N];
        if (i === from) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
    };
  const tear: Path = (c) => {
    trail(0, N - 1)(c);
    c.closePath();
  };
  // Intérieur sombre, tourbillon de deux bras spiralés rognés par la déchirure.
  p.fill(deep(violet, 0.92), 0.96, tear);
  c0.save();
  c0.beginPath();
  tear(c0);
  c0.clip();
  for (let arm = 0; arm < 2; arm++) {
    const col = arm ? cyan : violet;
    p.stroke(col, 1.7, 6, (c) => {
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const a = arm * Math.PI + t * 4.4;
        const rad = 2 + t * 33;
        const x = Math.cos(a) * rad * (RX / RY) * 1.1;
        const y = Math.sin(a) * rad;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
    });
  }
  c0.restore();
  // Bords : violet à gauche, cyan à droite.
  p.stroke(violet, 2.6, 12, trail(N / 4, (3 * N) / 4));
  p.stroke(cyan, 2.6, 12, trail((3 * N) / 4, (5 * N) / 4));
  // Étincelles aux deux pointes et éclats qui s'échappent.
  spark(p, 0, -RY - 3, 1.5, 6);
  spark(p, 0, RY + 3, 1.5, 6);
  const shards: [number, number, number, number][] = [
    [-16, -20, 2.6, 0.4],
    [17, -9, 2.2, 1.9],
    [-19, 8, 2.2, 3.1],
    [15, 22, 2.8, 4.4],
    [-13, 27, 1.9, 5.5],
    [21, 3, 1.8, 2.6],
  ];
  shards.forEach(([x, y, s, a], i) => {
    p.fill(
      i % 2 ? cyan : violet,
      0.9,
      (c) => {
        c.save();
        c.translate(x, y);
        c.rotate(a);
        c.moveTo(s * 1.6, 0);
        c.lineTo(-s, -s * 0.8);
        c.lineTo(-s * 0.5, s * 0.9);
        c.closePath();
        c.restore();
      },
      6,
    );
  });
}

// --- Pièce d'or -------------------------------------------------------------------------------

export function drawCoin(p: Pen): void {
  const gold = PALETTE.yellow;
  p.fill(gold, 0.6, disc(4.6), 5);
  p.stroke(gold, 1.5, 5, disc(4.6));
  trace(p, hot(gold, 0.5), 0.8, 0.9, disc(2.7));
  // Reflet : arc clair en haut à gauche et point brillant.
  p.stroke(PALETTE.white, 1, 2, (c) => {
    c.arc(0, 0, 3.4, -2.7, -1.6);
  });
  spark(p, -1.5, -1.6, 0.7, 3);
}

// --- Monticule fissuré d'un ver enfoui --------------------------------------------------------

export function drawMound(p: Pen): void {
  const sand = 0xffb347;
  const N = 22;
  const rad = (a: number): number =>
    15.5 * (1 + 0.07 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 5));
  const mound: Path = (c) => {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const x = Math.cos(a) * rad(a);
      const y = Math.sin(a) * rad(a);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  p.radial(sand, 22, 0.16, 0);
  p.fill(sand, 0.17, mound);
  p.stroke(sand, 2, 8, mound);
  // Rides de sable : arcs concentriques.
  trace(p, sand, 0.55, 1.4, (c) => {
    c.arc(0, 0, 11, 0.3, 2.3);
    c.moveTo(Math.cos(3.5) * 11, Math.sin(3.5) * 11);
    c.arc(0, 0, 11, 3.5, 5.0);
    c.moveTo(Math.cos(0.9) * 6.6, Math.sin(0.9) * 6.6);
    c.arc(0, 0, 6.6, 0.9, 2.6);
  });
  // Fissures rayonnantes en zigzag.
  p.stroke(hot(sand, 0.35), 1.4, 5, (c) => {
    const angles = [0.5, 1.6, 2.7, 3.9, 5.2];
    for (const a of angles) {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let i = 0; i <= 4; i++) {
        const d = 4.5 + i * 2.7;
        const o = i === 0 ? 0 : i % 2 ? 1.2 : -1.2;
        const x = ca * d - sa * o;
        const y = sa * d + ca * o;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
    }
  });
  // Cratère central où se tapit le ver, grains de sable projetés.
  p.fill(deep(sand, 0.85), 0.95, disc(4));
  p.stroke(sand, 1.5, 5, disc(4));
  p.fill(PALETTE.white, 0.85, (c) => {
    circle(c, 0.7, -10, -3);
    circle(c, 0.6, 9, 6);
    circle(c, 0.6, 3, -11);
    circle(c, 0.5, -6, 10);
  });
}
