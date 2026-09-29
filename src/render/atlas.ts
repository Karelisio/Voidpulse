/**
 * Atlas néon générés au démarrage en Canvas2D (aucune image externe). Planche principale :
 * tout ce que dessinent les ParticleContainer (une seule source de texture par couche) —
 * sprites, variante « flash blanc », zones, effets, chiffres de dégâts. Planche annexe : boss
 * et icônes (sprites simples du HUD, aussi exportées en data URL pour l'interface React).
 * Halos pré-calculés : aucun filtre en jeu.
 */
import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { BOSSES, CHARACTERS, ENEMIES, PASSIVES, WEAPONS } from '../content/data';
import { FRAME, FRAME_COUNT } from '../content/frames';
import { drawBossArt } from './boss-art';
import { drawEnemyArt } from './enemy-art';
import { drawIcon, iconColor } from './icons';
import { PALETTE } from './palette';
import { circle, Pen, poly, type Ctx } from './pen';
import { drawAltar, drawCoin, drawMerchant, drawMound, drawRift } from './prop-art';
import { drawShip } from './ship-art';

/** Résolution de dessin (texels par unité monde) : net jusqu'à un DPR de 2. */
const RES = 2;
/** Largeur des planches (unités) ; hauteur ajustée au contenu, au plus MAX_HEIGHT. */
const ATLAS = 1024;
const MAX_HEIGHT = 1024;
/** Taille des icônes dans l'atlas (unités ; dessinées sur une grille de 64). */
const ICON = 48;

// --- Sprites ---------------------------------------------------------------------------

function drawPlayer(p: Pen): void {
  const hull = (c: Ctx): void => {
    c.moveTo(19, 0);
    c.lineTo(-11, -13);
    c.lineTo(-5, 0);
    c.lineTo(-11, 13);
    c.closePath();
  };
  p.fill(PALETTE.cyan, 0.22, hull);
  p.stroke(PALETTE.cyan, 2.6, 12, hull);
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

function drawEnemy(p: Pen, index: number): void {
  drawEnemyArt(p, ENEMIES[index]);
}

function drawShotFire(p: Pen): void {
  p.fill(
    0xff7a2f,
    0.9,
    (c) => {
      c.ellipse(-2, 0, 11, 4.5, 0, 0, Math.PI * 2);
    },
    12,
  );
  p.fill(
    0xffe16a,
    1,
    (c) => {
      c.ellipse(2, 0, 6, 2.6, 0, 0, Math.PI * 2);
    },
    6,
  );
}

function drawShotGeneric(p: Pen): void {
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      circle(c, 3.5);
    },
    8,
  );
}

function drawBullet(p: Pen): void {
  p.fill(
    0xff3e7a,
    0.95,
    (c) => {
      circle(c, 5.2);
    },
    10,
  );
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, 2.2);
  });
}

/** Projectile ennemi blanc (teinté par la couleur du tireur). */
function drawBulletTint(p: Pen): void {
  p.fill(
    PALETTE.white,
    0.85,
    (c) => {
      circle(c, 5.2);
    },
    9,
  );
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, 2.4);
  });
}

// --- Dangers ennemis et surcouches (blancs, teintés au rendu) ------------------------------

/** Flaque ennemie : bord irrégulier, bulles, cœur plus dense. */
function drawHazard(p: Pen): void {
  const blob = (c: Ctx): void => {
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r = 50 + 5 * Math.sin(a * 5 + 0.7) + 3 * Math.sin(a * 11);
      if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
  };
  p.fill(PALETTE.white, 0.22, blob, 8);
  p.stroke(PALETTE.white, 1.8, 6, blob);
  p.radial(PALETTE.white, 40, 0.3, 0);
  p.stroke(PALETTE.white, 1.2, 4, (c) => {
    for (const [x, y, r] of [
      [-18, -10, 6],
      [14, 16, 4],
      [22, -18, 5],
      [-8, 24, 3.5],
      [-28, 12, 4],
    ] as const) {
      c.moveTo(x + r, y);
      c.arc(x, y, r, 0, Math.PI * 2);
    }
  });
}

/** Cible d'un obus : anneau, cercle intérieur pointillé, réticule. */
function drawTarget(p: Pen): void {
  p.fill(PALETTE.white, 0.12, (c) => {
    circle(c, 56);
  });
  p.stroke(PALETTE.white, 2.4, 8, (c) => {
    circle(c, 56);
  });
  p.stroke(PALETTE.white, 1.4, 4, (c) => {
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2;
      c.moveTo(Math.cos(a0) * 34, Math.sin(a0) * 34);
      c.arc(0, 0, 34, a0, a0 + 0.3);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      c.moveTo(Math.cos(a) * 42, Math.sin(a) * 42);
      c.lineTo(Math.cos(a) * 60, Math.sin(a) * 60);
    }
  });
  p.fill(PALETTE.white, 0.9, (c) => {
    circle(c, 3);
  });
}

/** Obus de mortier en vol. */
function drawShell(p: Pen): void {
  p.fill(
    PALETTE.white,
    0.9,
    (c) => {
      circle(c, 6.5);
    },
    10,
  );
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, 3, -1.5, -1.5);
  });
}

/** Cercle d'alerte : anneau hachuré (surgissement, explosion imminente). */
function drawWarn(p: Pen): void {
  p.fill(PALETTE.white, 0.14, (c) => {
    circle(c, 56);
  });
  p.stroke(PALETTE.white, 3, 8, (c) => {
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2;
      c.moveTo(Math.cos(a0) * 55, Math.sin(a0) * 55);
      c.arc(0, 0, 55, a0, a0 + 0.24);
    }
  });
  p.stroke(PALETTE.white, 1.2, 4, (c) => {
    circle(c, 46);
  });
}

/** Arc de bouclier frontal (±65° vers +x), rayon 24 : mis à l'échelle du porteur. */
function drawShieldArc(p: Pen): void {
  const arc = (c: Ctx): void => {
    c.arc(0, 0, 24, -1.13, 1.13);
  };
  p.stroke(PALETTE.white, 4.5, 10, arc);
  p.stroke(PALETTE.white, 1.2, 3, (c) => {
    c.arc(0, 0, 20, -1, 1);
  });
}

/** Bulle d'absorption (affixe Bouclier), rayon 28. */
function drawBubble(p: Pen): void {
  p.fill(PALETTE.white, 0.1, (c) => {
    circle(c, 28);
  });
  p.stroke(PALETTE.white, 1.6, 6, (c) => {
    circle(c, 28);
  });
  p.stroke(PALETTE.white, 2, 4, (c) => {
    c.arc(0, 0, 22, -2.4, -1.6);
  });
}

/** Protection d'un soutien : petit hexagone au-dessus de l'ennemi. */
function drawGuard(p: Pen): void {
  p.fill(PALETTE.white, 0.35, (c) => {
    poly(c, 6, 7, Math.PI / 6);
  });
  p.stroke(PALETTE.white, 1.6, 5, (c) => {
    poly(c, 6, 7, Math.PI / 6);
  });
}

/** Anneau d'aura (aura glaciale, rayon des soutiens) : pointillés, rayon 58. */
function drawAura(p: Pen): void {
  p.stroke(PALETTE.white, 1.6, 5, (c) => {
    for (let i = 0; i < 36; i++) {
      const a0 = (i / 36) * Math.PI * 2;
      c.moveTo(Math.cos(a0) * 58, Math.sin(a0) * 58);
      c.arc(0, 0, 58, a0, a0 + 0.1);
    }
  });
}

/** Flèche d'indicateur hors écran (pointe vers +x). */
function drawArrow(p: Pen): void {
  const tri = (c: Ctx): void => {
    c.moveTo(11, 0);
    c.lineTo(-7, -9);
    c.lineTo(-3, 0);
    c.lineTo(-7, 9);
    c.closePath();
  };
  p.fill(PALETTE.white, 0.9, tri, 8);
  p.stroke(PALETTE.white, 1.4, 4, tri);
}

function drawGem(p: Pen, r: number, color: number): void {
  const shape = (c: Ctx): void => {
    poly(c, 4, r, 0);
  };
  p.fill(color, 0.45, shape, 8);
  p.stroke(color, 1.6, 6, shape);
  p.fill(PALETTE.white, 0.9, (c) => {
    circle(c, r * 0.25);
  });
}

function drawOrbFrost(p: Pen): void {
  const shard = (c: Ctx): void => {
    c.moveTo(12, 0);
    c.lineTo(0, -5.5);
    c.lineTo(-10, 0);
    c.lineTo(0, 5.5);
    c.closePath();
  };
  p.fill(0x7fe8ff, 0.4, shard, 10);
  p.stroke(0x7fe8ff, 2, 10, shard);
  p.stroke(PALETTE.white, 1, 4, (c) => {
    c.moveTo(-6, 0);
    c.lineTo(8, 0);
  });
}

// --- Projectiles et zones blancs (teintés au rendu par la couleur de l'élément) ----------

function drawShotBolt(p: Pen): void {
  p.fill(
    PALETTE.white,
    0.85,
    (c) => {
      c.moveTo(13, 0);
      c.lineTo(2, -3.2);
      c.lineTo(-12, 0);
      c.lineTo(2, 3.2);
      c.closePath();
    },
    10,
  );
  p.fill(PALETTE.white, 1, (c) => {
    c.ellipse(3, 0, 6, 1.3, 0, 0, Math.PI * 2);
  });
}

function drawShotOrb(p: Pen): void {
  p.radial(PALETTE.white, 9, 0.9, 0);
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      circle(c, 3.6);
    },
    8,
  );
}

function drawShotShard(p: Pen): void {
  const shard = (c: Ctx): void => {
    c.moveTo(12, 0);
    c.lineTo(-2, -5);
    c.lineTo(-10, 0);
    c.lineTo(-2, 5);
    c.closePath();
  };
  p.fill(PALETTE.white, 0.45, shard, 10);
  p.stroke(PALETTE.white, 1.6, 8, shard);
}

function drawShotDisc(p: Pen): void {
  p.stroke(PALETTE.white, 2.4, 10, (c) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      c.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
      c.quadraticCurveTo(
        Math.cos(a + 0.9) * 14,
        Math.sin(a + 0.9) * 14,
        Math.cos(a + 1.9) * 12,
        Math.sin(a + 1.9) * 12,
      );
    }
  });
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, 3);
  });
}

function drawShotMissile(p: Pen): void {
  p.fill(
    PALETTE.white,
    0.95,
    (c) => {
      c.moveTo(10, 0);
      c.lineTo(-5, -4.5);
      c.lineTo(-2, 0);
      c.lineTo(-5, 4.5);
      c.closePath();
    },
    9,
  );
  p.fill(PALETTE.white, 0.5, (c) => {
    c.ellipse(-8, 0, 5, 1.8, 0, 0, Math.PI * 2);
  });
}

function drawShotVoid(p: Pen): void {
  p.radial(PALETTE.white, 13, 0.55, 0);
  p.fill(PALETTE.void, 1, (c) => {
    circle(c, 5.5);
  });
  p.stroke(PALETTE.white, 1.8, 10, (c) => {
    circle(c, 6.5);
  });
}

function drawOrbGeneric(p: Pen): void {
  p.radial(PALETTE.white, 15, 0.7, 0);
  p.stroke(PALETTE.white, 2, 8, (c) => {
    circle(c, 7);
  });
  p.fill(PALETTE.white, 1, (c) => {
    circle(c, 3.2);
  });
}

function drawPool(p: Pen): void {
  p.radial(PALETTE.white, 60, 0.32, 0.05);
  p.stroke(PALETTE.white, 1.6, 6, (c) => {
    circle(c, 56);
  });
  const c = p.ctx;
  c.globalAlpha = 0.45;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    c.save();
    c.translate(Math.cos(a) * 30, Math.sin(a) * 30);
    p.radial(PALETTE.white, 16, 0.4, 0);
    c.restore();
  }
  c.globalAlpha = 1;
}

function drawPlayerMine(p: Pen): void {
  p.stroke(PALETTE.white, 1.2, 4, (c) => {
    circle(c, 58);
  });
  p.fill(
    PALETTE.white,
    0.9,
    (c) => {
      poly(c, 6, 13, 0);
    },
    12,
  );
  p.fill(PALETTE.void, 1, (c) => {
    circle(c, 5);
  });
}

function drawStrike(p: Pen): void {
  p.stroke(PALETTE.white, 3, 10, (c) => {
    circle(c, 58);
  });
  p.stroke(PALETTE.white, 1.6, 6, (c) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      c.moveTo(Math.cos(a) * 34, Math.sin(a) * 34);
      c.lineTo(Math.cos(a) * 50, Math.sin(a) * 50);
    }
  });
  p.radial(PALETTE.white, 58, 0.18, 0);
}

function drawBeam(p: Pen): void {
  // Bandeau 64 × 56 étiré (ancre à gauche) : cœur clair, bords doux.
  const c = p.ctx;
  const g = c.createLinearGradient(0, -28, 0, 28);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(-32, -28, 64, 56);
}

function drawSurge(p: Pen): void {
  p.radial(PALETTE.white, 18, 0.9, 0);
  p.stroke(PALETTE.white, 1.4, 8, (c) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      c.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      c.lineTo(Math.cos(a + 0.3) * 11, Math.sin(a + 0.3) * 11);
      c.lineTo(Math.cos(a - 0.1) * 16, Math.sin(a - 0.1) * 16);
    }
  });
}

function drawWell(p: Pen): void {
  p.radial(PALETTE.white, 60, 0.05, 0.3);
  p.stroke(PALETTE.white, 2.2, 8, (c) => {
    for (let k = 0; k < 3; k++) {
      const off = (k / 3) * Math.PI * 2;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const a = off + t * Math.PI * 2.2;
        const r = 56 * (1 - t) + 4;
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    }
  });
  p.fill(PALETTE.void, 1, (c) => {
    circle(c, 9);
  });
}

/** Plaque de terrain (eau, glace, bourbier) : nappe irrégulière, bord lumineux, ondes. */
function drawTerrain(p: Pen): void {
  const blob =
    (k: number) =>
    (c: Ctx): void => {
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const r = k * (54 + 4 * Math.sin(a * 3 + 0.6) + 2.5 * Math.sin(a * 5 + 1.9));
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
    };
  p.fill(PALETTE.white, 0.16, blob(1));
  p.stroke(PALETTE.white, 1.8, 8, blob(1));
  p.stroke(PALETTE.white, 1, 4, blob(0.62));
  p.stroke(PALETTE.white, 0.8, 3, blob(0.3));
}

function drawChest(p: Pen): void {
  const gold = 0xffd23d;
  const body = (c: Ctx): void => {
    c.rect(-15, -6, 30, 18);
  };
  const lid = (c: Ctx): void => {
    c.moveTo(-15, -6);
    c.lineTo(-15, -11);
    c.quadraticCurveTo(0, -20, 15, -11);
    c.lineTo(15, -6);
    c.closePath();
  };
  p.radial(gold, 23, 0.35, 0);
  p.fill(0x2a1630, 1, body);
  p.fill(0x3a1d44, 1, lid);
  p.stroke(gold, 2.2, 12, body);
  p.stroke(gold, 2.2, 12, lid);
  p.stroke(PALETTE.cyan, 1.6, 8, (c) => {
    c.moveTo(0, -12);
    c.lineTo(0, 11);
  });
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      c.rect(-3, -4, 6, 6);
    },
    8,
  );
}

function drawVapor(p: Pen): void {
  p.radial(0xdfe7ff, 60, 0.42, 0);
  const c = p.ctx;
  c.globalAlpha = 0.5;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    c.save();
    c.translate(Math.cos(a) * 26, Math.sin(a) * 26);
    p.radial(0xffffff, 26, 0.25, 0);
    c.restore();
  }
  c.globalAlpha = 1;
}

function drawRing(p: Pen, width: number): void {
  p.stroke(PALETTE.white, width, 8, (c) => {
    circle(c, 58);
  });
}

function drawRect(p: Pen): void {
  // Bandeau 64 × 64 étiré à la taille de la charge (ancre à gauche).
  const c = p.ctx;
  const g = c.createLinearGradient(-32, 0, 32, 0);
  g.addColorStop(0, p.col(PALETTE.white, 0.55));
  g.addColorStop(1, p.col(PALETTE.white, 0.12));
  c.fillStyle = g;
  c.fillRect(-32, -28, 64, 56);
  c.fillStyle = p.col(PALETTE.white, 0.95);
  c.fillRect(-32, -30, 64, 3);
  c.fillRect(-32, 27, 64, 3);
}

function drawMine(p: Pen): void {
  p.fill(PALETTE.white, 0.16, (c) => {
    circle(c, 58);
  });
  p.stroke(PALETTE.white, 2.5, 8, (c) => {
    circle(c, 58);
  });
  p.stroke(PALETTE.white, 1.5, 4, (c) => {
    circle(c, 20);
    c.moveTo(-34, 0);
    c.lineTo(34, 0);
    c.moveTo(0, -34);
    c.lineTo(0, 34);
  });
}

// --- Construction ------------------------------------------------------------------------

interface Entry {
  key: string;
  w: number;
  h: number;
  draw: (p: Pen) => void;
  flash: boolean;
}

export interface Atlas {
  frames: Texture[];
  flash: Texture[];
  fx: {
    spark: Texture;
    glow: Texture;
    ring: Texture;
    ringThin: Texture;
    shard: Texture;
    beam: Texture;
    puff: Texture;
    arrow: Texture;
  };
  digits: Texture[];
  icons: Record<string, Texture>;
  /** Icônes en data URL (cartes de level-up React). */
  iconUrls: Record<string, string>;
}

export function buildAtlas(): Atlas {
  const entries: Entry[] = [];
  const side: Entry[] = [];
  const add = (key: string, w: number, h: number, draw: (p: Pen) => void, flash = false): void => {
    entries.push({ key, w, h, draw, flash });
  };
  const addSide = (
    key: string,
    w: number,
    h: number,
    draw: (p: Pen) => void,
    flash = false,
  ): void => {
    side.push({ key, w, h, draw, flash });
  };
  add(`f${FRAME.PLAYER}`, 56, 56, drawPlayer, true);
  CHARACTERS.forEach((c, i) => {
    addSide(
      `f${FRAME.PLAYER_BASE + i}`,
      56,
      56,
      (p) => {
        drawShip(p, c.id);
      },
      true,
    );
  });
  ENEMIES.forEach((e, i) => {
    const s = Math.ceil(e.radius * 3 + 16);
    add(
      `f${FRAME.ENEMY_BASE + i}`,
      s,
      s,
      (p) => {
        drawEnemy(p, i);
      },
      true,
    );
  });
  add(`f${FRAME.SHOT_FIRE}`, 36, 20, drawShotFire);
  add(`f${FRAME.SHOT_GENERIC}`, 20, 20, drawShotGeneric);
  add(`f${FRAME.BULLET}`, 26, 26, drawBullet);
  add(`f${FRAME.GEM_S}`, 20, 20, (p) => {
    drawGem(p, 5, PALETTE.cyan);
  });
  add(`f${FRAME.GEM_M}`, 26, 26, (p) => {
    drawGem(p, 7, PALETTE.lime);
  });
  add(`f${FRAME.GEM_L}`, 34, 34, (p) => {
    drawGem(p, 10, PALETTE.violet);
  });
  add(`f${FRAME.ORB_FROST}`, 34, 22, drawOrbFrost);
  add(`f${FRAME.ZONE_VAPOR}`, 128, 128, drawVapor);
  add(`f${FRAME.ZONE_RING}`, 128, 128, (p) => {
    drawRing(p, 3);
  });
  add(`f${FRAME.ZONE_RECT}`, 64, 64, drawRect);
  add(`f${FRAME.ZONE_MINE}`, 128, 128, drawMine);
  add(`f${FRAME.SHOT_BOLT}`, 30, 12, drawShotBolt);
  add(`f${FRAME.SHOT_ORB}`, 22, 22, drawShotOrb);
  add(`f${FRAME.SHOT_SHARD}`, 28, 14, drawShotShard);
  add(`f${FRAME.SHOT_DISC}`, 34, 34, drawShotDisc);
  add(`f${FRAME.SHOT_MISSILE}`, 30, 14, drawShotMissile);
  add(`f${FRAME.SHOT_VOID}`, 30, 30, drawShotVoid);
  add(`f${FRAME.ORB_GENERIC}`, 34, 34, drawOrbGeneric);
  add(`f${FRAME.ZONE_POOL}`, 128, 128, drawPool);
  add(`f${FRAME.ZONE_PMINE}`, 128, 128, drawPlayerMine);
  add(`f${FRAME.ZONE_STRIKE}`, 128, 128, drawStrike);
  add(`f${FRAME.ZONE_BEAM}`, 64, 56, drawBeam);
  add(`f${FRAME.ZONE_SURGE}`, 40, 40, drawSurge);
  add(`f${FRAME.ZONE_WELL}`, 128, 128, drawWell);
  add(`f${FRAME.TERRAIN}`, 128, 128, drawTerrain);
  add(`f${FRAME.CHEST}`, 64, 48, drawChest);
  add(`f${FRAME.COIN}`, 20, 20, drawCoin);
  add(`f${FRAME.MOUND}`, 48, 48, drawMound);
  add(`f${FRAME.MERCHANT}`, 72, 72, drawMerchant);
  add(`f${FRAME.ALTAR}`, 96, 96, drawAltar);
  add(`f${FRAME.RIFT}`, 96, 96, drawRift);
  add(`f${FRAME.ZONE_HAZARD}`, 128, 128, drawHazard);
  add(`f${FRAME.ZONE_TARGET}`, 128, 128, drawTarget);
  add(`f${FRAME.SHELL}`, 24, 24, drawShell);
  add(`f${FRAME.ZONE_WARN}`, 128, 128, drawWarn);
  add(`f${FRAME.SHIELD_ARC}`, 64, 64, drawShieldArc);
  add(`f${FRAME.BUBBLE}`, 72, 72, drawBubble);
  add(`f${FRAME.GUARD}`, 24, 24, drawGuard);
  add(`f${FRAME.AURA}`, 128, 128, drawAura);
  add(`f${FRAME.BULLET_TINT}`, 26, 26, drawBulletTint);
  add('arrow', 32, 32, drawArrow);
  add('spark', 16, 16, (p) => {
    p.fill(
      PALETTE.white,
      1,
      (c) => {
        circle(c, 2.6);
      },
      6,
    );
  });
  add('glow', 64, 64, (p) => {
    p.radial(PALETTE.white, 30, 0.9, 0);
  });
  add('puff', 64, 64, (p) => {
    p.radial(PALETTE.white, 30, 0.35, 0);
  });
  add('ring', 128, 128, (p) => {
    drawRing(p, 4);
  });
  add('ringThin', 128, 128, (p) => {
    drawRing(p, 1.6);
  });
  add('shard', 16, 16, (p) => {
    p.fill(PALETTE.white, 1, (c) => {
      c.moveTo(6, 0);
      c.lineTo(-4, -3);
      c.lineTo(-4, 3);
      c.closePath();
    });
  });
  add('beam', 16, 16, (p) => {
    const c = p.ctx;
    const g = c.createLinearGradient(0, -8, 0, 8);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-8, -8, 16, 16);
  });
  for (let d = 0; d <= 9; d++) {
    add(`d${d}`, 14, 20, (p) => {
      const c = p.ctx;
      c.font = '800 19px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(8,4,16,0.9)';
      c.strokeText(String(d), 0, 1);
      c.fillStyle = '#fff';
      c.fillText(String(d), 0, 1);
    });
  }
  const iconIds = [
    ...WEAPONS.flatMap((w) => [w.id, w.evolution.id]),
    ...PASSIVES.map((p) => p.id),
    'heal',
    'gold',
  ];
  for (const id of iconIds)
    addSide(`i:${id}`, ICON, ICON, (p) => {
      p.ctx.scale(ICON / 64, ICON / 64);
      drawIcon(p, id, iconColor(id));
    });

  const main = pack(entries, 'principale');
  const annex = pack(side, 'annexe');
  const tex = (key: string): Texture => {
    const sheet = main.rects.has(key) ? main : annex;
    const frame = sheet.rects.get(key);
    if (!frame) throw new Error(`Texture absente : ${key}`);
    return new Texture({ source: sheet.source, frame });
  };
  const has = (key: string): boolean => main.rects.has(key) || annex.rects.has(key);
  const empty = tex('spark');
  const frames: Texture[] = [];
  const flash: Texture[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    frames.push(has(`f${i}`) ? tex(`f${i}`) : empty);
    flash.push(has(`f${i}w`) ? tex(`f${i}w`) : frames[i]);
  }
  const icons: Record<string, Texture> = {};
  const iconUrls: Record<string, string> = {};
  for (const id of iconIds) {
    icons[id] = tex(`i:${id}`);
    const small = document.createElement('canvas');
    small.width = 128;
    small.height = 128;
    const sctx = small.getContext('2d');
    if (sctx) {
      sctx.setTransform(2, 0, 0, 2, 64, 64);
      drawIcon(new Pen(sctx, false), id, iconColor(id));
      iconUrls[id] = small.toDataURL('image/png');
    }
  }
  return {
    frames,
    flash,
    fx: {
      spark: tex('spark'),
      glow: tex('glow'),
      ring: tex('ring'),
      ringThin: tex('ringThin'),
      shard: tex('shard'),
      beam: tex('beam'),
      puff: tex('puff'),
      arrow: tex('arrow'),
    },
    digits: Array.from({ length: 10 }, (_, d) => tex(`d${d}`)),
    icons,
    iconUrls,
  };
}

/**
 * Rangement en étagères (entrées triées par hauteur) puis dessin : la hauteur de la planche
 * s'ajuste au contenu (multiple de 64). Les clés en « …w » sont les variantes flash.
 */
function pack(
  entries: readonly Entry[],
  name: string,
): { source: CanvasSource; rects: Map<string, Rectangle> } {
  const pad = 2;
  const order = [
    ...entries,
    ...entries.filter((e) => e.flash).map((e) => ({ ...e, key: `${e.key}w` })),
  ].sort((a, b) => b.h - a.h);
  const rects = new Map<string, Rectangle>();
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const e of order) {
    if (x + e.w + pad > ATLAS) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    rects.set(e.key, new Rectangle(x, y, e.w, e.h));
    x += e.w + pad;
    rowH = Math.max(rowH, e.h);
  }
  const height = Math.ceil((y + rowH + pad) / 64) * 64;
  if (height > MAX_HEIGHT) throw new Error(`Planche ${name} pleine (${String(height)} unités)`);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS * RES;
  canvas.height = height * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  for (const e of order) {
    const r = rects.get(e.key);
    if (!r) continue;
    ctx.save();
    ctx.setTransform(RES, 0, 0, RES, (r.x + e.w / 2) * RES, (r.y + e.h / 2) * RES);
    e.draw(new Pen(ctx, e.key.endsWith('w') && e.key.startsWith('f')));
    ctx.restore();
  }
  if (import.meta.env.DEV) {
    console.info(
      `Atlas ${name} : ${String(ATLAS)} × ${String(height)} (${String(order.length)} images)`,
    );
  }
  return { source: new CanvasSource({ resource: canvas, resolution: RES }), rects };
}

/**
 * Textures de boss, dessinées à la demande (une seule planche par boss rencontré) : elles ne
 * tiendraient pas toutes dans l'annexe. Mises en cache pour la durée de l'application.
 */
const bossCache = new Map<number, { normal: Texture; flash: Texture }>();

export function bossTextures(index: number): { normal: Texture; flash: Texture } {
  const hit = bossCache.get(index);
  if (hit) return hit;
  const def = BOSSES[index];
  const s = Math.ceil(def.radius * 3 + 20);
  const canvas = document.createElement('canvas');
  canvas.width = s * 2 * RES;
  canvas.height = s * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  for (const white of [false, true]) {
    ctx.save();
    ctx.setTransform(RES, 0, 0, RES, (s / 2 + (white ? s : 0)) * RES, (s / 2) * RES);
    drawBossArt(new Pen(ctx, white), def);
    ctx.restore();
  }
  const source = new CanvasSource({ resource: canvas, resolution: RES });
  const out = {
    normal: new Texture({ source, frame: new Rectangle(0, 0, s, s) }),
    flash: new Texture({ source, frame: new Rectangle(s, 0, s, s) }),
  };
  bossCache.set(index, out);
  return out;
}
