/**
 * Vaisseaux des 12 personnages jouables, dessinés en Canvas2D (vectoriel néon). Repère : origine au
 * centre de la cellule 56 × 56, l'AVANT du vaisseau vers +x (le sprite tourne avec la direction du
 * joueur). Géométrie dans un rayon ~21, halos ≤ 12. Langage commun : un cœur blanc lumineux et une
 * lueur de réacteur à l'arrière (-x) ; silhouette franche, 2 à 3 couleurs, remplissage translucide
 * + contour néon. Seul le crayon (Pen) pose de la couleur : le même dessin est rejoué en « mode
 * blanc » pour le flash de coup.
 */
import { PALETTE, mix } from './palette';
import { circle, poly, type Ctx, type Pen } from './pen';

type Path = (c: Ctx) => void;

const TAU = Math.PI * 2;

const hot = (color: number, t = 0.55): number => mix(color, PALETTE.white, t);

// --- Outils de tracé ------------------------------------------------------------------------

/** Polygone fermé symétrique en y : moitié haute (y ≤ 0) à plat x0, y0, x1, y1… du nez à la queue. */
const sym =
  (top: readonly number[]): Path =>
  (c) => {
    const n = top.length / 2;
    c.moveTo(top[0], top[1]);
    for (let i = 1; i < n; i++) c.lineTo(top[i * 2], top[i * 2 + 1]);
    for (let i = n - 1; i >= 0; i--) {
      if (top[i * 2 + 1] !== 0) c.lineTo(top[i * 2], -top[i * 2 + 1]);
    }
    c.closePath();
  };

/** Segments indépendants x0, y0, x1, y1 (m : recopie symétrique en y). */
const segs =
  (k: readonly number[], m = false): Path =>
  (c) => {
    for (let i = 0; i < k.length; i += 4) {
      c.moveTo(k[i], k[i + 1]);
      c.lineTo(k[i + 2], k[i + 3]);
      if (m) {
        c.moveTo(k[i], -k[i + 1]);
        c.lineTo(k[i + 2], -k[i + 3]);
      }
    }
  };

/** Ligne brisée ouverte x0, y0, x1, y1… (m : recopie symétrique en y). */
const line =
  (k: readonly number[], m = false): Path =>
  (c) => {
    for (const s of m ? [1, -1] : [1]) {
      c.moveTo(k[0], k[1] * s);
      for (let i = 2; i < k.length; i += 2) c.lineTo(k[i], k[i + 1] * s);
    }
  };

/** Tracé exécuté dans un repère décalé de (x, y) puis tourné de rot. */
const at =
  (x: number, y: number, rot: number, path: Path): Path =>
  (c) => {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    path(c);
    c.restore();
  };

/** Feuille / pétale de longueur len et de demi-largeur w, base en (0, 0), pointe en (len, 0). */
const leaf =
  (len: number, w: number): Path =>
  (c) => {
    c.moveTo(0, 0);
    c.quadraticCurveTo(len * 0.5, -w * 2, len, 0);
    c.quadraticCurveTo(len * 0.5, w * 2, 0, 0);
    c.closePath();
  };

/** Cœur blanc lumineux (halo coloré diffus + petit disque blanc), comme le vaisseau de base. */
function core(p: Pen, halo: number, x = 3, r = 3.2): void {
  const c = p.ctx;
  c.save();
  c.translate(x, 0);
  p.radial(halo, 9, 0.32, 0);
  c.restore();
  p.fill(
    PALETTE.white,
    1,
    (cc) => {
      circle(cc, r, x, 0);
    },
    10,
  );
}

/** Lueur de réacteur : petit jet triangulaire vers -x, cœur clair, halo. */
function thruster(p: Pen, color: number, x: number, y = 0, len = 8, w = 3.4): void {
  p.fill(
    color,
    0.5,
    (c) => {
      c.moveTo(x, y - w);
      c.lineTo(x - len, y);
      c.lineTo(x, y + w);
      c.closePath();
    },
    9,
  );
  p.stroke(color, 1.8, 8, (c) => {
    c.moveTo(x, y);
    c.lineTo(x - len * 0.75, y);
  });
}

/** Coque : remplissage translucide puis contour néon. */
function hull(p: Pen, color: number, path: Path, alpha = 0.22, width = 2.6, glow = 12): void {
  p.fill(color, alpha, path);
  p.stroke(color, width, glow, path);
}

// --- Les 12 vaisseaux ----------------------------------------------------------------------

/** vex — pilote d'essai : la flèche d'origine (cyan + accent magenta). */
function drawVex(p: Pen): void {
  const body = (c: Ctx): void => {
    c.moveTo(19, 0);
    c.lineTo(-11, -13);
    c.lineTo(-5, 0);
    c.lineTo(-11, 13);
    c.closePath();
  };
  p.fill(PALETTE.cyan, 0.22, body);
  p.stroke(PALETTE.cyan, 2.6, 12, body);
  p.stroke(PALETTE.magenta, 1.6, 8, (c) => {
    c.moveTo(-9, -7);
    c.lineTo(-16, -7);
    c.moveTo(-9, 7);
    c.lineTo(-16, 7);
  });
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      circle(c, 3.2, 3, 0);
    },
    10,
  );
}

/** nova — cryomancienne : delta cristallin à facettes, pointes d'ailes givrées. */
function drawNova(p: Pen): void {
  const ice = 0x7fe8ff;
  const body = sym([19, 0, 3, -7, -3, -13, -11, -16, -8, -7, -6, 0]);
  hull(p, ice, body);
  // Facettes internes.
  p.stroke(PALETTE.white, 1.2, 4, segs([19, 0, -8, -7, 3, -7, -6, 0, -3, -13, -8, -7], true));
  // Éclats de givre aux pointes d'ailes.
  const shard = (y: number): Path =>
    at(-10.5, y, 0, (c) => {
      c.moveTo(4, 0);
      c.lineTo(0, y < 0 ? -2.6 : 2.6);
      c.lineTo(-4, 0);
      c.lineTo(0, y < 0 ? 2.6 : -2.6);
      c.closePath();
    });
  p.fill(PALETTE.white, 0.75, shard(-15.5), 6);
  p.fill(PALETTE.white, 0.75, shard(15.5), 6);
  thruster(p, ice, -6, 0, 8, 3);
  core(p, ice, 4);
}

/** volt — tempêtier : ailes en éclair (zigzag), nez en pointe. */
function drawVolt(p: Pen): void {
  const yel = 0xfff06a;
  const body = sym([19, 0, 7, -3.5, 1, -16, 2, -8, -13, -14, -7, -3, -12, 0]);
  hull(p, yel, body, 0.2);
  // Nervure centrale et arc électrique entre les ailes.
  p.stroke(hot(yel, 0.7), 1.2, 5, line([15, 0, 8, 0]));
  p.stroke(PALETTE.white, 1, 6, line([-1, -5, 2, -1.5, -1, 1.5, 2, 5]));
  thruster(p, yel, -11, 0, 7, 3);
  core(p, yel, 6);
}

/** toxa — alchimiste : coque en fiole, deux petites fioles latérales. */
function drawToxa(p: Pen): void {
  const lime = 0x9cff3d;
  const flask: Path = (c) => {
    c.moveTo(18, -3.4);
    c.lineTo(8.5, -3.4);
    // Bulbe : arc du haut vers le bas en passant par l'arrière.
    c.arc(-3, 0, 11.6, -0.3, 0.3, true);
    c.lineTo(18, 3.4);
    c.closePath();
  };
  hull(p, lime, flask);
  // Lèvre du goulot.
  p.stroke(hot(lime, 0.4), 2, 6, segs([18.3, -5, 18.3, 5]));
  // Niveau de liquide ondulé dans le bulbe.
  p.stroke(mix(lime, PALETTE.white, 0.3), 1.3, 5, (c) => {
    c.moveTo(-13, 4);
    c.quadraticCurveTo(-10, 1.5, -7, 4);
    c.quadraticCurveTo(-4, 6.5, -1, 4);
    c.quadraticCurveTo(2, 1.5, 5, 4);
  });
  // Bulles.
  p.stroke(PALETTE.white, 1, 3, (c) => {
    c.moveTo(-9.5, -4);
    c.arc(-10, -4, 1.5, 0, TAU);
    c.moveTo(-3.5, 8.5);
    c.arc(-4.5, 8.5, 1, 0, TAU);
  });
  // Petites fioles latérales, reliées à la coque.
  for (const s of [-1, 1]) {
    const vial: Path = (c) => {
      circle(c, 3.3, -3, s * 15.5);
      c.moveTo(0.3, s * 14.3);
      c.lineTo(6, s * 14.3);
      c.lineTo(6, s * 16.7);
      c.lineTo(0.3, s * 16.7);
    };
    p.fill(lime, 0.28, vial);
    p.stroke(lime, 2, 8, vial);
    p.stroke(lime, 1.4, 5, segs([-3, s * 12.2, -3, s * 10]));
  }
  thruster(p, lime, -14.5, 0, 4, 3);
  core(p, lime, -1);
}

/** lyra — arcaniste : ailes en croissant, petit anneau de runes autour du cœur. */
function drawLyra(p: Pen): void {
  const pink = 0xff6af0;
  const crescent: Path = (c) => {
    c.moveTo(19, 0);
    c.quadraticCurveTo(14, -17, -9, -18);
    c.quadraticCurveTo(5, -9, -4, 0);
    c.quadraticCurveTo(5, 9, -9, 18);
    c.quadraticCurveTo(14, 17, 19, 0);
    c.closePath();
  };
  hull(p, pink, crescent, 0.2);
  // Anneau de runes : arcs pointillés + petits traits radiaux.
  p.stroke(PALETTE.white, 1.2, 5, (c) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.15;
      c.moveTo(4 + Math.cos(a) * 8.5, Math.sin(a) * 8.5);
      c.arc(4, 0, 8.5, a, a + 0.62);
    }
  });
  p.stroke(hot(pink, 0.3), 1.2, 5, (c) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.15 + 0.31;
      c.moveTo(4 + Math.cos(a) * 10, Math.sin(a) * 10);
      c.lineTo(4 + Math.cos(a) * 12.4, Math.sin(a) * 12.4);
    }
  });
  thruster(p, pink, -5, 0, 8, 3);
  core(p, pink, 4);
}

/** kael — pèlerin du vide : coque en crochet, cœur entouré d'un anneau sombre (trou noir). */
function drawKael(p: Pen): void {
  const vio = 0x8a5cff;
  // Coque en crochet : le nez s'enroule vers l'aile basse, l'autre flanc reste plein.
  const hook: Path = (c) => {
    c.moveTo(-14, -12);
    c.quadraticCurveTo(6, -18, 16, -8);
    c.quadraticCurveTo(21, -2, 17, 5);
    c.quadraticCurveTo(15.5, 8, 12, 5.5);
    c.quadraticCurveTo(15, 0, 11, -4);
    c.quadraticCurveTo(0, -6, -3, 0);
    c.quadraticCurveTo(-1, 9, -10, 15);
    c.quadraticCurveTo(-16, 10, -12, 0);
    c.quadraticCurveTo(-17, -6, -14, -12);
    c.closePath();
  };
  hull(p, vio, hook, 0.24);
  // Trou noir : disque sombre cerclé de violet, cœur blanc au centre.
  p.fill(0x030208, 0.92, (c) => {
    circle(c, 7.4, -1, 0);
  });
  p.stroke(vio, 1.6, 8, (c) => {
    circle(c, 7.4, -1, 0);
  });
  p.stroke(PALETTE.magenta, 1, 6, (c) => {
    c.moveTo(-1 + 5.2, 0);
    c.arc(-1, 0, 5.2, 0, 1.9);
  });
  thruster(p, vio, -14, 2, 7, 3);
  core(p, vio, -1, 2.6);
}

/** brakka — colosse : coque large et blindée, deux réacteurs. */
function drawBrakka(p: Pen): void {
  const org = 0xff8a3d;
  const body = sym([18, -3, 14, -9, 2, -13, -8, -13, -13, -9, -13, 0]);
  hull(p, org, body, 0.24, 3);
  // Plaques d'épaule blindées.
  const upper = (c: Ctx): void => {
    c.moveTo(7, -13.5);
    c.lineTo(9, -17);
    c.lineTo(-7, -17);
    c.lineTo(-9, -13.5);
    c.closePath();
  };
  for (const s of [-1, 1]) {
    const plate = (c: Ctx): void => {
      c.save();
      c.scale(1, s);
      upper(c);
      c.restore();
    };
    p.fill(org, 0.34, plate);
    p.stroke(org, 2, 8, plate);
  }
  // Joints de blindage.
  p.stroke(hot(org, 0.35), 1.3, 4, segs([2, -13, 2, 13, -6, -13, -6, 13]));
  p.stroke(PALETTE.yellow, 1.6, 6, segs([17.5, -1.8, 17.5, 1.8]));
  // Deux réacteurs.
  for (const s of [-1, 1]) {
    const nacelle = (c: Ctx): void => {
      c.rect(-17, s * 8 - 3, 5, 6);
    };
    p.fill(org, 0.4, nacelle);
    p.stroke(org, 2, 8, nacelle);
    thruster(p, org, -17, s * 8, 4, 3);
  }
  core(p, org, 6, 3.6);
}

/** sable — chasseuse : coque longue en aiguille, long canon de nez. */
function drawSable(p: Pen): void {
  const gold = 0xffd23d;
  const body = sym([13, 0, 8, -3, -2, -4.5, -9, -12, -15, -12, -12, -4, -16, -2.5, -16, 0]);
  hull(p, gold, body, 0.22, 2.4);
  // Long canon de nez.
  const barrel = (c: Ctx): void => {
    c.rect(10, -1.3, 9, 2.6);
  };
  p.fill(gold, 0.35, barrel);
  p.stroke(gold, 2, 8, barrel);
  p.stroke(PALETTE.white, 1.6, 6, segs([19.3, -3.4, 19.3, 3.4]));
  // Ligne de visée.
  p.stroke(hot(gold, 0.5), 1, 3, segs([-2, -4.5, -2, 4.5]));
  thruster(p, gold, -16, 0, 4, 2.6);
  core(p, gold, 2, 2.9);
}

/** mira — botaniste : ailes en pétales / feuilles. */
function drawMira(p: Pen): void {
  const grn = 0x7dff9a;
  const petal = (x: number, y: number, rot: number, len: number, w: number): void => {
    const path = at(x, y, rot, leaf(len, w));
    p.fill(grn, 0.2, path);
    p.stroke(grn, 2.2, 10, path);
    p.stroke(hot(grn, 0.6), 1, 3, at(x, y, rot, line([len * 0.15, 0, len * 0.72, 0])));
  };
  // Pétales arrière, puis latéraux, puis bourgeon avant.
  petal(-4, 1, 2.5, 17, 3);
  petal(-4, -1, -2.5, 17, 3);
  petal(-3, 1.5, 0.95, 20, 3.4);
  petal(-3, -1.5, -0.95, 20, 3.4);
  petal(-5, 0, 0, 26, 3.2);
  // Pollen aux pointes.
  const pollen = 0xfff06a;
  for (const s of [-1, 1]) {
    p.fill(
      pollen,
      0.9,
      (c) => {
        circle(c, 1.6, -3 + Math.cos(0.95) * 20, s * (1.5 + Math.sin(0.95) * 20));
      },
      6,
    );
  }
  thruster(p, grn, -9, 0, 7, 2.6);
  core(p, grn, 0);
}

/** orin — artificier : coque trapue, deux nacelles de mines sur les flancs. */
function drawOrin(p: Pen): void {
  const org = 0xff5a1f;
  const body = sym([18, -3, 12, -9, -8, -10, -14, -6, -14, 0]);
  hull(p, org, body, 0.24, 2.8);
  // Nacelles de mines : disque hérissé de pointes, relié à la coque.
  for (const s of [-1, 1]) {
    p.stroke(org, 2, 6, segs([-2, s * 9.5, -2, s * 12.6]));
    const pod = (c: Ctx): void => {
      circle(c, 4.6, -2, s * 16);
    };
    p.fill(org, 0.32, pod);
    p.stroke(org, 2.2, 9, pod);
    p.stroke(PALETTE.yellow, 1.4, 4, (c) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.PI / 8;
        c.moveTo(-2 + Math.cos(a) * 5.4, s * 16 + Math.sin(a) * 5.4);
        c.lineTo(-2 + Math.cos(a) * 7.4, s * 16 + Math.sin(a) * 7.4);
      }
    });
    p.fill(
      PALETTE.yellow,
      0.95,
      (c) => {
        circle(c, 1.6, -2, s * 16);
      },
      6,
    );
  }
  thruster(p, org, -14, 0, 8, 3.6);
  core(p, org, 3);
}

/** zeph — coureur : racer effilé, ailerons en flèche, traits de vitesse. */
function drawZeph(p: Pen): void {
  const aqua = 0x5affc8;
  const body = sym([19, 0, 6, -3, -6, -4, -13, -3, -14, 0]);
  hull(p, aqua, body, 0.22, 2.4);
  // Ailerons en flèche.
  for (const s of [-1, 1]) {
    const fin = (c: Ctx): void => {
      c.moveTo(4, s * 3);
      c.lineTo(-13, s * 14);
      c.lineTo(-11, s * 5);
      c.closePath();
    };
    p.fill(aqua, 0.26, fin);
    p.stroke(aqua, 2, 9, fin);
  }
  // Traits de vitesse.
  p.stroke(hot(aqua, 0.35), 1.2, 5, segs([-7, 14.5, -19, 14.5, -12, 17.5, -20, 17.5], true));
  p.stroke(aqua, 1, 4, segs([-15, 5, -20, 5], true));
  thruster(p, aqua, -14, 0, 5, 2.4);
  core(p, aqua, 4, 2.9);
}

/** ysolde — oracle : vaisseau hexagonal « œil », anneau en orbite, cœur en œil. */
function drawYsolde(p: Pen): void {
  const lav = 0xc9a8ff;
  const hex: Path = (c) => {
    poly(c, 6, 15.5, 0);
  };
  hull(p, lav, hex, 0.2, 2.6);
  // Œil : amande, iris, pupille-cœur.
  const eye: Path = (c) => {
    c.moveTo(-10, 0);
    c.quadraticCurveTo(0, -12, 10, 0);
    c.quadraticCurveTo(0, 12, -10, 0);
    c.closePath();
  };
  p.fill(PALETTE.violet, 0.3, eye);
  p.stroke(hot(lav, 0.15), 1.4, 6, eye);
  p.stroke(lav, 1.4, 6, (c) => {
    circle(c, 5, 1, 0);
  });
  // Anneau en orbite, incliné, avec sa petite lune.
  const ring: Path = (c) => {
    c.ellipse(0, 0, 21, 8, -0.6, 0, TAU);
  };
  p.stroke(PALETTE.violet, 1.6, 8, ring);
  p.fill(
    PALETTE.white,
    0.95,
    (c) => {
      const t = 0.9;
      const ex = Math.cos(t) * 21;
      const ey = Math.sin(t) * 8;
      circle(
        c,
        1.9,
        ex * Math.cos(-0.6) - ey * Math.sin(-0.6),
        ex * Math.sin(-0.6) + ey * Math.cos(-0.6),
      );
    },
    7,
  );
  thruster(p, lav, -15, 0, 6, 3);
  core(p, lav, 1, 2.6);
}

/** Dessine le vaisseau du personnage `id` (défaut : vex). */
export function drawShip(p: Pen, id: string): void {
  switch (id) {
    case 'nova':
      drawNova(p);
      break;
    case 'volt':
      drawVolt(p);
      break;
    case 'toxa':
      drawToxa(p);
      break;
    case 'lyra':
      drawLyra(p);
      break;
    case 'kael':
      drawKael(p);
      break;
    case 'brakka':
      drawBrakka(p);
      break;
    case 'sable':
      drawSable(p);
      break;
    case 'mira':
      drawMira(p);
      break;
    case 'orin':
      drawOrin(p);
      break;
    case 'zeph':
      drawZeph(p);
      break;
    case 'ysolde':
      drawYsolde(p);
      break;
    case 'vex':
    default:
      drawVex(p);
  }
}
