/**
 * Répartiteur d'événements de la simulation vers le « game feel » : effets visuels, chiffres,
 * tremblements, hit stop, flashs, haptique et audio. Lu une fois par frame, puis la file est
 * vidée par l'hôte.
 */
import { AFFIXES, BOSSES, ENEMIES, REACTIONS, RUN_EVENTS, colorOf } from '../content/data';
import { Foe } from '../engine/components';
import type { EventQueue } from '../engine/events';
import type { FixedLoop } from '../engine/loop';
import { ELEMENT_COLORS, PALETTE } from '../render/palette';
import type { GameRenderer } from '../render/renderer';
import { ENEMY_ACTION, EV, RUN_EVENT_KIND, RUN_EVENT_PHASE } from '../systems/events';
import type { RunSim } from '../systems/sim';
import type { Haptics } from './haptics';

/** Récepteur audio des événements : lit la file entière en une fois (aucun appel par événement). */
export interface AudioSink {
  consume(q: EventQueue, camX: number, halfW: number): void;
}

const ENEMY_COLORS = ENEMIES.map((e) => colorOf(e.color));
const REACTION_COLORS = REACTIONS.map((r) => colorOf(r.color));
const SAND = 0xffb347;
const GOLD = 0xffd23d;
const RIFT = 0xb36bff;

/** Bandeau d'une élite : nom du type et affixes. */
function eliteBanner(renderer: GameRenderer, eid: number, type: number): void {
  const names: string[] = [];
  const mask = Foe.affix[eid];
  for (let i = 0; i < AFFIXES.length; i++) if (mask & (1 << i)) names.push(AFFIXES[i].name);
  renderer.hud.banner(`ÉLITE · ${ENEMIES[type]?.name ?? ''}`, names.join(' · '), 0xffb13d, 1.8);
}

/** Annonces des événements de run (apparition, activation, fin). */
function runEventFx(renderer: GameRenderer, kind: number, phase: number, x: number, y: number) {
  const hud = renderer.hud;
  if (phase === RUN_EVENT_PHASE.APPEAR) {
    switch (kind) {
      case RUN_EVENT_KIND.MERCHANT:
        hud.banner(
          'MARCHAND AMBULANT',
          `Il repart dans ${String(RUN_EVENTS.merchant.duration)} s : suivez la flèche dorée`,
          GOLD,
        );
        renderer.ring(x, y, 70, GOLD, 0.6);
        break;
      case RUN_EVENT_KIND.ALTAR:
        hud.banner('AUTEL DE SACRIFICE', 'Restez dans son cercle pour l’invoquer', PALETTE.red);
        renderer.ring(x, y, 80, PALETTE.red, 0.6);
        break;
      case RUN_EVENT_KIND.HORDE:
        hud.banner('HORDE DORÉE !', 'Interceptez les scarabées : or et XP', GOLD);
        renderer.screenFlash(GOLD, 0.18);
        break;
      case RUN_EVENT_KIND.RIFT:
        hud.banner('FAILLE TEMPORELLE', 'Entrez-y pour suspendre le temps', RIFT);
        renderer.ring(x, y, 80, RIFT, 0.6);
        break;
    }
  } else if (phase === RUN_EVENT_PHASE.ACTIVATE && kind === RUN_EVENT_KIND.RIFT) {
    hud.banner(
      'TEMPS SUSPENDU',
      `Ennemis ralentis · XP ×${String(RUN_EVENTS.rift.xp).replace('.', ',')}`,
      RIFT,
      2,
    );
    renderer.screenFlash(RIFT, 0.35);
    renderer.ring(x, y, 320, RIFT, 0.8);
  }
}

export function dispatchEvents(
  sim: RunSim,
  renderer: GameRenderer,
  loop: FixedLoop,
  haptics: Haptics,
  audio: AudioSink | null,
): void {
  const q: EventQueue = sim.events;
  const cam = renderer.camera;
  const halfW = renderer.width / 2 / cam.zoom;
  audio?.consume(q, cam.x, halfW);
  for (let i = 0; i < q.count; i++) {
    const type = q.type[i];
    const a = q.a[i];
    const b = q.b[i];
    const x = q.x[i];
    const y = q.y[i];
    const v = q.v[i];
    const w = q.w[i];
    switch (type) {
      case EV.HIT: {
        if (((b >> 17) & 1) === 1) {
          // Coup bloqué (bouclier, bulle) : étincelle blanche, pas de chiffre.
          if ((i & 1) === 0) renderer.burst(x, y, 0xffffff, 2, 110, 0.18, 0.6);
          break;
        }
        const element = (b >> 8) & 0xff;
        const crit = ((b >> 16) & 1) === 1;
        const color = element < ELEMENT_COLORS.length ? ELEMENT_COLORS[element] : 0xffffff;
        renderer.number(a, x, y, v, crit, color);
        if (crit) renderer.burst(x, y, color, 3, 140, 0.25, 0.8);
        break;
      }
      case EV.KILL: {
        const color = b < ENEMY_COLORS.length ? ENEMY_COLORS[b] : PALETTE.cyan;
        const big = b < ENEMIES.length && ENEMIES[b].radius >= 18;
        renderer.burst(x, y, color, big ? 18 : 9, big ? 220 : 160, 0.5, big ? 1.3 : 1);
        if (big) {
          renderer.ring(x, y, 60, color, 0.3, true);
          cam.shake(0.12);
        }
        break;
      }
      case EV.PLAYER_HURT:
        renderer.screenFlash(PALETTE.red, 0.28);
        cam.shake(0.35);
        haptics.hurt();
        break;
      case EV.PLAYER_DEATH:
        renderer.burst(x, y, PALETTE.cyan, 40, 320, 1, 1.6);
        renderer.ring(x, y, 160, PALETTE.cyan, 0.7);
        cam.shake(0.9);
        loop.hitStopFor(14);
        haptics.death();
        break;
      case EV.FIRE:
        // Nova : anneau à la portée de l'impulsion.
        if (v > 0) {
          const color = w < ELEMENT_COLORS.length ? ELEMENT_COLORS[w] : 0xffffff;
          renderer.ring(x, y, v, color, 0.32, false, 0.8);
          renderer.glow(x, y, v * 0.4, color, 0.18, 0.35);
        }
        break;
      case EV.STRIKE: {
        const color = w < ELEMENT_COLORS.length ? ELEMENT_COLORS[w] : 0xffffff;
        renderer.beam(x + 30, y - 320, x, y, color);
        renderer.ring(x, y, v, color, 0.3);
        renderer.burst(x, y, color, 8, 180, 0.35);
        cam.shake(0.06);
        break;
      }
      case EV.CHEST_DROP:
        renderer.ring(x, y, 70, PALETTE.yellow, 0.6);
        renderer.burst(x, y, PALETTE.yellow, 16, 200, 0.6, 1.2);
        break;
      case EV.CHEST_OPEN:
        renderer.screenFlash(PALETTE.yellow, 0.25);
        haptics.levelUp();
        break;
      case EV.EVOLUTION:
        renderer.screenFlash(0xffffff, 0.45);
        renderer.ring(cam.x, cam.y, 260, PALETTE.yellow, 0.8);
        cam.shake(0.4);
        haptics.eveil();
        break;
      case EV.ELITE_SPAWN:
        renderer.ring(x, y, 90, PALETTE.yellow, 0.5, true);
        eliteBanner(renderer, a, b);
        break;
      case EV.SHIELD_BREAK: {
        const color = ENEMY_COLORS[Foe.type[a]] ?? 0xffffff;
        renderer.burst(x, y, color, 14, 240, 0.45, 1.1);
        renderer.burst(x, y, 0xffffff, 6, 180, 0.3, 0.8);
        renderer.ring(x, y, 50, color, 0.3, true);
        cam.shake(0.12);
        break;
      }
      case EV.ENEMY_ACTION:
        enemyActionFx(renderer, a, b, x, y, v);
        break;
      case EV.RUN_EVENT:
        runEventFx(renderer, a, b, x, y);
        break;
      case EV.COIN:
        if ((i & 1) === 0) renderer.glow(x, y, 8, GOLD, 0.2, 0.7);
        break;
      case EV.PLAYER_SLOWED:
        renderer.burst(x, y, 0xa8e6ff, 10, 140, 0.4, 0.9);
        renderer.ring(x, y, 36, 0xa8e6ff, 0.3, true);
        break;
      case EV.EVEIL_FINALE: {
        const color = a >= 0 && a < REACTION_COLORS.length ? REACTION_COLORS[a] : 0xd98bff;
        renderer.screenFlash(0xffffff, 0.5);
        renderer.ring(x, y, v, color, 0.9);
        renderer.ring(x, y, v * 0.6, 0xffffff, 0.6);
        renderer.burst(x, y, color, 40, 420, 0.9, 1.6);
        cam.shake(0.8);
        loop.hitStopFor(6);
        haptics.eveil();
        break;
      }
      case EV.BEAM: {
        const color = b < ELEMENT_COLORS.length ? ELEMENT_COLORS[b] : 0xffffff;
        renderer.beam(x, y, v, w, color);
        break;
      }
      case EV.REACTION: {
        const color = REACTION_COLORS[a] ?? 0xffffff;
        renderer.ring(x, y, v, color, 0.4);
        renderer.glow(x, y, v * 0.6, color, 0.3, 0.7);
        // Forme ultime de l'Éveil (b = 1) : répétée, donc plus discrète.
        renderer.burst(x, y, color, b === 1 ? 6 : 10, 240, 0.45, 1.1);
        if (b !== 1) {
          cam.shake(0.14);
          haptics.reaction();
        }
        break;
      }
      case EV.EVEIL_START:
        renderer.screenFlash(0xffffff, 0.45);
        renderer.ring(cam.x, cam.y, 420, 0xd98bff, 0.8);
        cam.shake(0.6);
        loop.hitStopFor(8);
        haptics.eveil();
        break;
      case EV.EVEIL_NOVA: {
        const color = a < ELEMENT_COLORS.length ? ELEMENT_COLORS[a] : 0xffffff;
        renderer.ring(x, y, v, color, 0.45);
        renderer.glow(x, y, v * 0.45, color, 0.3, 0.5);
        cam.shake(0.1);
        break;
      }
      case EV.LEVEL_UP:
        renderer.ring(renderer.camera.x, renderer.camera.y, 120, PALETTE.cyan, 0.5);
        haptics.levelUp();
        break;
      case EV.XP:
        if ((i & 3) === 0) renderer.glow(x, y, 6, PALETTE.cyan, 0.2, 0.6);
        break;
      case EV.DASH: {
        // Couleur du personnage ; la téléportation glacée éclate au départ.
        const color = colorOf(sim.state.character.color);
        renderer.ring(x, y, a === 1 ? 90 : 40, color, 0.25, true);
        renderer.burst(x, y, color, a === 1 ? 16 : 8, 120, 0.3, 0.9);
        haptics.tap();
        break;
      }
      case EV.DASH_END: {
        const color = colorOf(sim.state.character.color);
        renderer.ring(x, y, v, color, 0.4);
        renderer.burst(x, y, color, 14, 220, 0.4, 1.1);
        if (a === 6) cam.shake(0.2);
        break;
      }
      case EV.PACT:
        renderer.screenFlash(PALETTE.red, 0.2);
        break;
      case EV.EXPLOSION: {
        // 0 kamikaze, 1 mine de boss, 3 mine du joueur, 4 implosion, 5 obus, 6 élite
        // instable, 7 surgissement ; w : élément (couleur) quand il y en a un.
        const color =
          w < ELEMENT_COLORS.length && a !== 1
            ? ELEMENT_COLORS[w]
            : a === 0
              ? PALETTE.yellow
              : a === 6
                ? 0xffb13d
                : a === 7
                  ? SAND
                  : PALETTE.red;
        renderer.ring(x, y, v, color, 0.4);
        renderer.glow(x, y, v * 0.7, color, 0.25, 0.8);
        renderer.burst(x, y, color, a === 6 ? 26 : 16, 260, 0.5, 1.2);
        cam.shake(a === 6 ? 0.45 : 0.25);
        break;
      }
      case EV.BLINK:
        renderer.burst(x, y, 0x8a7dff, 8, 120, 0.35);
        renderer.burst(v, w, 0x8a7dff, 8, 120, 0.35);
        renderer.ring(v, w, 30, 0x8a7dff, 0.3, true);
        break;
      case EV.BOSS_SPAWN: {
        const color = colorOf(BOSSES[a]?.color ?? '#6ff7ff');
        renderer.screenFlash(color, 0.35);
        renderer.ring(x, y, 220, color, 0.9);
        cam.shake(0.7);
        haptics.boss();
        break;
      }
      case EV.BOSS_PHASE:
        renderer.ring(x, y, 260, b ? PALETTE.magenta : 0x6ff7ff, 0.8);
        renderer.screenFlash(b ? PALETTE.magenta : 0xffffff, 0.3);
        cam.shake(0.6);
        loop.hitStopFor(10);
        haptics.boss();
        break;
      case EV.BOSS_DEATH:
        renderer.burst(x, y, 0x6ff7ff, 60, 380, 1.2, 1.8);
        renderer.burst(x, y, PALETTE.magenta, 40, 300, 1, 1.4);
        renderer.ring(x, y, 320, 0xffffff, 1);
        renderer.screenFlash(0xffffff, 0.6);
        cam.shake(1);
        loop.hitStopFor(20);
        haptics.death();
        break;
      case EV.BOSS_SLAM:
        renderer.ring(x, y, v, PALETTE.red, 0.35);
        cam.shake(0.35);
        break;
      case EV.FREEZE:
        renderer.burst(x, y, 0x9fe8ff, 5, 90, 0.35, 0.8);
        break;
    }
  }
}

/** Actions d'ennemis : signaux lisibles (élan, incantation, soins…) et impacts. */
function enemyActionFx(
  renderer: GameRenderer,
  action: number,
  eid: number,
  x: number,
  y: number,
  v: number,
): void {
  const color = ENEMY_COLORS[Foe.type[eid]] ?? 0xffffff;
  switch (action) {
    case ENEMY_ACTION.CHARGE:
      renderer.ring(x, y, 34, color, 0.35, true);
      break;
    case ENEMY_ACTION.DASH:
      renderer.burst(x, y, color, 8, 160, 0.3, 0.9);
      break;
    case ENEMY_ACTION.SNIPE:
    case ENEMY_ACTION.MORTAR:
      renderer.glow(x, y, 22, color, 0.2, 0.9);
      break;
    case ENEMY_ACTION.VOLLEY:
      renderer.ring(x, y, 46, color, 0.3, true);
      break;
    case ENEMY_ACTION.SUMMON:
      renderer.ring(x, y, v, color, 0.45);
      renderer.burst(x, y, color, 12, 180, 0.45);
      break;
    case ENEMY_ACTION.HEAL:
      renderer.ring(x, y, v, color, 0.5);
      renderer.glow(x, y, v * 0.5, color, 0.35, 0.35);
      break;
    case ENEMY_ACTION.SPLIT:
      renderer.burst(x, y, color, 16, 220, 0.45, 1.1);
      break;
    case ENEMY_ACTION.BURROW:
      renderer.burst(x, y, SAND, 12, 140, 0.45, 1);
      break;
    case ENEMY_ACTION.EMERGE:
      renderer.burst(x, y, SAND, 18, 240, 0.5, 1.2);
      break;
    case ENEMY_ACTION.ENRAGE:
      renderer.ring(x, y, 70, PALETTE.red, 0.45, true);
      renderer.burst(x, y, PALETTE.red, 12, 200, 0.4);
      break;
    case ENEMY_ACTION.VOLATILE:
      renderer.ring(x, y, v, 0xffb13d, 0.5, true);
      break;
    default:
  }
}
