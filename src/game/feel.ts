/**
 * Répartiteur d'événements de la simulation vers le « game feel » : effets visuels, chiffres,
 * tremblements, hit stop, flashs, haptique et audio. Lu une fois par frame, puis la file est
 * vidée par l'hôte.
 */
import { BOSSES, ENEMIES, REACTIONS, colorOf } from '../content/data';
import type { EventQueue } from '../engine/events';
import type { FixedLoop } from '../engine/loop';
import { ELEMENT_COLORS, PALETTE } from '../render/palette';
import type { GameRenderer } from '../render/renderer';
import { EV } from '../systems/events';
import type { RunSim } from '../systems/sim';
import type { Haptics } from './haptics';

/** Récepteur audio des événements (moteur audio du jeu). */
export interface AudioSink {
  onEvent(
    type: number,
    a: number,
    b: number,
    x: number,
    y: number,
    v: number,
    w: number,
    pan: number,
  ): void;
}

const ENEMY_COLORS = ENEMIES.map((e) => colorOf(e.color));
const REACTION_COLORS = REACTIONS.map((r) => colorOf(r.color));

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
  for (let i = 0; i < q.count; i++) {
    const type = q.type[i];
    const a = q.a[i];
    const b = q.b[i];
    const x = q.x[i];
    const y = q.y[i];
    const v = q.v[i];
    const w = q.w[i];
    const pan = Math.max(-1, Math.min(1, (x - cam.x) / Math.max(1, halfW)));
    audio?.onEvent(type, a, b, x, y, v, w, pan);
    switch (type) {
      case EV.HIT: {
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
        break;
      case EV.BEAM: {
        const color = b < ELEMENT_COLORS.length ? ELEMENT_COLORS[b] : 0xffffff;
        renderer.beam(x, y, v, w, color);
        break;
      }
      case EV.REACTION: {
        const color = REACTION_COLORS[a] ?? 0xffffff;
        renderer.ring(x, y, v, color, 0.4);
        renderer.glow(x, y, v * 0.6, color, 0.3, 0.7);
        renderer.burst(x, y, color, 10, 240, 0.45, 1.1);
        cam.shake(0.14);
        haptics.reaction();
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
      case EV.DASH:
        renderer.ring(x, y, 40, PALETTE.cyan, 0.25, true);
        renderer.burst(x, y, PALETTE.cyan, 8, 120, 0.3, 0.9);
        haptics.tap();
        break;
      case EV.EXPLOSION: {
        const color = a === 0 ? PALETTE.yellow : PALETTE.red;
        renderer.ring(x, y, v, color, 0.4);
        renderer.glow(x, y, v * 0.7, color, 0.25, 0.8);
        renderer.burst(x, y, color, 16, 260, 0.5, 1.2);
        cam.shake(0.25);
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
