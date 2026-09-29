/**
 * Atlas néon généré au démarrage en Canvas2D (aucune image externe) : sprites de jeu, variante
 * « flash blanc » de chaque sprite, textures d'effets, chiffres de dégâts, icônes (aussi
 * exportées en data URL pour l'interface React). Halos pré-calculés : aucun filtre en jeu.
 */
import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { BOSSES, ENEMIES, PASSIVES, WEAPONS, colorOf } from '../content/data';
import { FRAME, FRAME_COUNT } from '../content/frames';
import { drawIcon, iconColor } from './icons';
import { mix, PALETTE } from './palette';
import { circle, Pen, poly, type Ctx } from './pen';

/** Résolution de dessin (texels par unité monde) : net jusqu'à un DPR de 2. */
const RES = 2;
const ATLAS = 1024;
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
  const def = ENEMIES[index];
  const color = colorOf(def.color);
  const r = def.radius;
  switch (def.behavior) {
    case 'swarm': {
      const body = (c: Ctx): void => {
        circle(c, r * 0.72);
      };
      p.fill(color, 0.28, body);
      p.stroke(color, 2, 9, body);
      p.stroke(color, 1.6, 6, (c) => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          c.moveTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
          c.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
        }
      });
      p.fill(PALETTE.white, 1, (c) => {
        circle(c, 1.6, r * 0.3, -r * 0.25);
        circle(c, 1.6, r * 0.3, r * 0.25);
      });
      break;
    }
    case 'tank': {
      p.fill(color, 0.22, (c) => {
        poly(c, 6, r);
      });
      p.stroke(color, 2.8, 12, (c) => {
        poly(c, 6, r);
      });
      p.fill(mix(color, 0x000000, 0.4), 0.55, (c) => {
        poly(c, 6, r * 0.55);
      });
      p.stroke(color, 1.8, 6, (c) => {
        poly(c, 6, r * 0.55);
      });
      p.stroke(PALETTE.yellow, 2, 8, (c) => {
        c.moveTo(r * 0.55, -r * 0.45);
        c.lineTo(r * 1.05, -r * 0.7);
        c.moveTo(r * 0.55, r * 0.45);
        c.lineTo(r * 1.05, r * 0.7);
      });
      break;
    }
    case 'shooter': {
      const body = (c: Ctx): void => {
        c.arc(0, 0, r * 0.85, 0.55, Math.PI * 2 - 0.55);
        c.lineTo(r * 0.2, 0);
        c.closePath();
      };
      p.fill(color, 0.25, body);
      p.stroke(color, 2.2, 10, body);
      p.stroke(color, 1.4, 6, (c) => {
        circle(c, r * 0.35, -r * 0.2, 0);
      });
      p.fill(
        PALETTE.white,
        1,
        (c) => {
          circle(c, 1.8, -r * 0.2, 0);
        },
        6,
      );
      break;
    }
    case 'kamikaze': {
      p.fill(color, 0.25, (c) => {
        circle(c, r * 0.8);
      });
      p.stroke(color, 2.2, 10, (c) => {
        circle(c, r * 0.8);
      });
      p.stroke(PALETTE.red, 2, 8, (c) => {
        c.moveTo(-r * 0.4, -r * 0.4);
        c.lineTo(r * 0.4, r * 0.4);
        c.moveTo(r * 0.4, -r * 0.4);
        c.lineTo(-r * 0.4, r * 0.4);
      });
      p.stroke(color, 1.4, 6, (c) => {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          c.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
          c.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
        }
      });
      break;
    }
    case 'teleporter': {
      p.fill(color, 0.22, (c) => {
        poly(c, 4, r, 0);
      });
      p.stroke(color, 2.2, 11, (c) => {
        poly(c, 4, r, 0);
      });
      p.fill(color, 0.6, (c) => {
        c.ellipse(0, 0, r * 0.45, r * 0.25, 0, 0, Math.PI * 2);
      });
      p.fill(
        PALETTE.white,
        1,
        (c) => {
          circle(c, 2.2);
        },
        8,
      );
      break;
    }
  }
}

function drawBoss(p: Pen, index: number): void {
  const def = BOSSES[index];
  const color = colorOf(def.color);
  const r = def.radius;
  p.fill(color, 0.12, (c) => {
    poly(c, 8, r, Math.PI / 8);
  });
  p.stroke(color, 3.2, 16, (c) => {
    poly(c, 8, r, Math.PI / 8);
  });
  p.stroke(PALETTE.violet, 2, 10, (c) => {
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 + 0.12;
      c.moveTo(Math.cos(a0) * r * 0.68, Math.sin(a0) * r * 0.68);
      c.arc(0, 0, r * 0.68, a0, a0 + Math.PI / 4 - 0.24);
    }
  });
  p.stroke(color, 2.2, 10, (c) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      c.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      c.lineTo(Math.cos(a) * r * 1.22, Math.sin(a) * r * 1.22);
    }
  });
  p.fill(
    PALETTE.magenta,
    0.8,
    (c) => {
      circle(c, r * 0.28);
    },
    14,
  );
  p.fill(
    PALETTE.white,
    1,
    (c) => {
      circle(c, r * 0.11, r * 0.08, 0);
    },
    10,
  );
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
  p.radial(gold, 30, 0.35, 0);
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
  };
  digits: Texture[];
  icons: Record<string, Texture>;
  /** Icônes en data URL (cartes de level-up React). */
  iconUrls: Record<string, string>;
}

export function buildAtlas(): Atlas {
  const entries: Entry[] = [];
  const add = (key: string, w: number, h: number, draw: (p: Pen) => void, flash = false): void => {
    entries.push({ key, w, h, draw, flash });
  };
  add(`f${FRAME.PLAYER}`, 56, 56, drawPlayer, true);
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
  BOSSES.forEach((b, i) => {
    const s = Math.ceil(b.radius * 3 + 20);
    add(
      `f${FRAME.BOSS_BASE + i}`,
      s,
      s,
      (p) => {
        drawBoss(p, i);
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
  add(`f${FRAME.CHEST}`, 64, 48, drawChest);
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
    add(`i:${id}`, ICON, ICON, (p) => {
      p.ctx.scale(ICON / 64, ICON / 64);
      drawIcon(p, id, iconColor(id));
    });

  // Rangement en étagères (entrées triées par hauteur).
  const pad = 2;
  const order = [
    ...entries,
    ...entries.filter((e) => e.flash).map((e) => ({ ...e, key: `${e.key}w` })),
  ].sort((a, b) => b.h - a.h);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS * RES;
  canvas.height = ATLAS * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
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
    if (y + e.h + pad > ATLAS) throw new Error('Atlas plein');
    ctx.save();
    ctx.setTransform(RES, 0, 0, RES, (x + e.w / 2) * RES, (y + e.h / 2) * RES);
    e.draw(new Pen(ctx, e.key.endsWith('w') && e.key.startsWith('f')));
    ctx.restore();
    rects.set(e.key, new Rectangle(x, y, e.w, e.h));
    x += e.w + pad;
    rowH = Math.max(rowH, e.h);
  }

  const source = new CanvasSource({ resource: canvas, resolution: RES });
  const tex = (key: string): Texture => {
    const frame = rects.get(key);
    if (!frame) throw new Error(`Texture absente : ${key}`);
    return new Texture({ source, frame });
  };
  const empty = tex('spark');
  const frames: Texture[] = [];
  const flash: Texture[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    frames.push(rects.has(`f${i}`) ? tex(`f${i}`) : empty);
    flash.push(rects.has(`f${i}w`) ? tex(`f${i}w`) : frames[i]);
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
    },
    digits: Array.from({ length: 10 }, (_, d) => tex(`d${d}`)),
    icons,
    iconUrls,
  };
}
