/**
 * Pont entre la partie et le moteur audio : événements de la simulation → effets sonores,
 * état de la partie → intensité musicale, scènes musicales (stage, boss, fin de run).
 */
import { REACTIONS, WEAPONS } from '../content/data';
import { Pos } from '../engine/components';
import type { AudioBridge } from '../game/host';
import { EV, TELEGRAPH_KIND } from '../systems/events';
import type { RunSim } from '../systems/sim';
import type { AudioEngine } from './engine';
import { rawIntensity } from './music/intensity';

/** Rayon (unités monde) dans lequel les ennemis comptent pour l'intensité. */
const NEARBY_RADIUS = 420;
const ELEMENT_IDS = ['fire', 'frost', 'lightning', 'poison', 'arcane', 'void'];
const FIRE_IDS = WEAPONS.map((w) => `fire.${w.id}`);
const REACTION_IDS = REACTIONS.map((r) => `reaction.${r.id}`);

export class GameAudio implements AudioBridge {
  private xpCombo = 0;
  private xpTime = -1;
  private toneTimer = 0;
  private ended = false;

  constructor(readonly engine: AudioEngine) {}

  startRun(): void {
    this.ended = false;
    this.xpCombo = 0;
    const m = this.engine.music;
    if (m) {
      m.intensity.reset(0);
      void m.play('stage', 1);
      m.prepare('boss');
    }
    this.engine.setEveil(false);
  }

  onEvent(
    type: number,
    a: number,
    b: number,
    _x: number,
    _y: number,
    v: number,
    _w: number,
    pan: number,
  ): void {
    const sfx = this.engine.sfx;
    const e = this.engine;
    switch (type) {
      case EV.HIT: {
        const crit = ((b >> 16) & 1) === 1;
        const element = (b >> 8) & 0xff;
        if (crit) sfx.play('hit.crit', { pan });
        else if (element < ELEMENT_IDS.length)
          sfx.play(`hit.${ELEMENT_IDS[element]}`, { pan, gain: 0.8 });
        else sfx.play('hit', { pan });
        break;
      }
      case EV.KILL:
        sfx.play(b === 255 ? 'boss.death' : v >= 5 ? 'kill.big' : 'kill', { pan });
        break;
      case EV.PLAYER_HURT:
        sfx.play('player.hurt');
        e.duck(-4, 0.02, 0.15, 0.5);
        break;
      case EV.PLAYER_DEATH:
        sfx.play('player.death');
        e.duck(-10, 0.05, 1.2, 2);
        break;
      case EV.FIRE:
        if (b < FIRE_IDS.length) sfx.play(FIRE_IDS[b], { pan, gain: 0.7 });
        break;
      case EV.REACTION:
        if (a < REACTION_IDS.length && !sfx.play(REACTION_IDS[a], { pan }))
          sfx.play('reaction', { pan });
        break;
      case EV.EVEIL_START:
        sfx.play('eveil.start');
        e.duck(-6, 0.02, 0.5, 1);
        e.setEveil(true);
        break;
      case EV.EVEIL_END:
        sfx.play('eveil.end');
        e.setEveil(false);
        break;
      case EV.EVEIL_NOVA:
        sfx.play('eveil.nova', { pan });
        break;
      case EV.LEVEL_UP:
        sfx.play('levelup');
        e.duck(-5, 0.03, 0.4, 0.8);
        break;
      case EV.XP: {
        const now = e.now;
        this.xpCombo = now - this.xpTime < 0.6 ? this.xpCombo + 1 : 0;
        this.xpTime = now;
        sfx.play('xp', { pan: pan * 0.5, rate: 1 + Math.min(0.6, this.xpCombo * 0.025) });
        break;
      }
      case EV.DASH:
        sfx.play('dash');
        break;
      case EV.ENEMY_SHOT:
        sfx.play(b === 1 ? 'boss.shot' : 'enemy.shot', { pan });
        break;
      case EV.EXPLOSION:
        sfx.play(a === 1 ? 'mine' : 'explosion', { pan });
        break;
      case EV.BLINK:
        sfx.play('blink', { pan });
        break;
      case EV.TELEGRAPH:
        if (a === TELEGRAPH_KIND.KAMIKAZE) sfx.play('telegraph.fuse', { pan });
        else if (a === TELEGRAPH_KIND.SHOOTER) sfx.play('telegraph.charge', { pan, gain: 0.7 });
        else if (a === TELEGRAPH_KIND.BOSS) sfx.play('telegraph.boss', { pan });
        break;
      case EV.BOSS_SPAWN:
        sfx.play('boss.spawn');
        e.duck(-6, 0.05, 1, 1.5);
        void e.music?.play('boss');
        break;
      case EV.BOSS_PHASE:
        sfx.play(b === 1 ? 'boss.rage' : 'boss.phase');
        e.duck(-4, 0.03, 0.5, 1);
        break;
      case EV.BOSS_DEATH:
        sfx.play('boss.death');
        e.duck(-8, 0.05, 1.5, 2);
        break;
      case EV.BOSS_SLAM:
        sfx.play('boss.slam', { pan });
        break;
      case EV.FREEZE:
        sfx.play('freeze', { pan, gain: 0.8 });
        break;
      case EV.RUN_END:
        if (!this.ended) {
          this.ended = true;
          sfx.play(a === 1 ? 'run.victory' : 'run.defeat');
          e.setEveil(false);
          void e.music?.play('end');
        }
        break;
    }
  }

  update(sim: RunSim, dt: number, paused: boolean): void {
    const e = this.engine;
    const st = sim.state;
    e.setPaused(paused || st.status === 'levelup');
    const m = e.music;
    if (!m || paused || st.status !== 'running') return;
    const p = st.player.eid;
    const px = Pos.x[p];
    const py = Pos.y[p];
    const pool = sim.world.enemies;
    const r2 = NEARBY_RADIUS * NEARBY_RADIUS;
    let nearby = 0;
    for (let i = 0; i < pool.count; i++) {
      const en = pool.active[i];
      const dx = Pos.x[en] - px;
      const dy = Pos.y[en] - py;
      if (dx * dx + dy * dy < r2) nearby++;
    }
    const boss = st.boss.eid >= 0 && sim.world.boss.isActive(st.boss.eid);
    m.update(
      rawIntensity({
        nearby,
        hpRatio: st.player.hp / Math.max(1, st.player.stats.maxHp),
        elites: 0,
        boss,
      }),
      dt,
    );
    this.toneTimer -= dt;
    if (this.toneTimer <= 0) {
      this.toneTimer = 0.1;
      e.setTone(m.intensity.value);
    }
  }
}

/** Sons d'interface (menus React). */
export function uiSound(
  engine: AudioEngine | null,
  id: 'ui.click' | 'ui.card' | 'ui.confirm' | 'ui.back',
): void {
  engine?.sfx.play(id);
}
