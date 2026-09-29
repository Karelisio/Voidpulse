/**
 * Pont entre la partie et le moteur audio : événements de la simulation → effets sonores,
 * état de la partie → intensité musicale, scènes musicales (stage, boss, fin de run).
 */
import { REACTIONS, WEAPONS } from '../content/data';
import { Foe, Pos } from '../engine/components';
import type { EventQueue } from '../engine/events';
import type { AudioBridge } from '../game/host';
import {
  ENEMY_ACTION,
  EV,
  RUN_EVENT_KIND,
  RUN_EVENT_PHASE,
  TELEGRAPH_KIND,
} from '../systems/events';
import type { RunSim } from '../systems/sim';
import type { AudioEngine } from './engine';
import { rawIntensity } from './music/intensity';

/** Rayon (unités monde) dans lequel les ennemis comptent pour l'intensité. */
const NEARBY_RADIUS = 420;
const HIT_IDS = ['fire', 'frost', 'lightning', 'poison', 'arcane', 'void'].map((e) => `hit.${e}`);
const FIRE_IDS = WEAPONS.map((w) => `fire.${w.id}`);
const REACTION_IDS = REACTIONS.map((r) => `reaction.${r.id}`);
/** Sons des actions d'ennemis (index = ENEMY_ACTION). */
const ACTION_IDS: Record<number, string> = {
  [ENEMY_ACTION.CHARGE]: 'enemy.charge',
  [ENEMY_ACTION.DASH]: 'enemy.dash',
  [ENEMY_ACTION.AIM]: 'enemy.aim',
  [ENEMY_ACTION.SNIPE]: 'enemy.snipe',
  [ENEMY_ACTION.VOLLEY]: 'enemy.volley',
  [ENEMY_ACTION.SUMMON]: 'enemy.summon',
  [ENEMY_ACTION.HEAL]: 'enemy.heal',
  [ENEMY_ACTION.SPLIT]: 'enemy.split',
  [ENEMY_ACTION.MORTAR]: 'mortar.launch',
  [ENEMY_ACTION.BURROW]: 'burrow.dig',
  [ENEMY_ACTION.EMERGE]: 'burrow.emerge',
  [ENEMY_ACTION.ENRAGE]: 'elite.enrage',
  [ENEMY_ACTION.VOLATILE]: 'elite.volatile',
};
/** Accents sonores des dashs (index = DASH_KINDS) : blink, éclair, nuée, soin, mine. */
const DASH_ACCENT = ['', 'blink', 'fire.arc', 'fire.miasma', '', '', '', '', 'xp', 'mine', '', ''];
const APPEAR_IDS: Record<number, string> = {
  [RUN_EVENT_KIND.MERCHANT]: 'event.merchant',
  [RUN_EVENT_KIND.ALTAR]: 'event.altar',
  [RUN_EVENT_KIND.HORDE]: 'event.horde',
  [RUN_EVENT_KIND.RIFT]: 'event.rift',
};

export class GameAudio implements AudioBridge {
  private xpCombo = 0;
  private xpTime = -1;
  private toneTimer = 0;
  private ended = false;
  /** Faille en cours (son de sortie à sa fin, pas à l'expiration d'une faille inutilisée). */
  private rift = false;

  constructor(readonly engine: AudioEngine) {}

  startRun(): void {
    this.ended = false;
    this.rift = false;
    this.engine.setRift(false);
    this.xpCombo = 0;
    const m = this.engine.music;
    if (m) {
      m.intensity.reset(0);
      void m.play('stage', 1);
      m.prepare('boss');
    }
    this.engine.setEveil(false);
  }

  /** Lit la file d'événements de la frame : un seul appel, lecture directe des colonnes. */
  consume(q: EventQueue, camX: number, halfW: number): void {
    const sfx = this.engine.sfx;
    const e = this.engine;
    const inv = 1 / Math.max(1, halfW);
    for (let i = 0; i < q.count; i++) {
      const type = q.type[i];
      const a = q.a[i];
      const b = q.b[i];
      const v = q.v[i];
      const pan = Math.max(-1, Math.min(1, (q.x[i] - camX) * inv));
      switch (type) {
        case EV.HIT: {
          if (((b >> 17) & 1) === 1) {
            sfx.play('shield.block', pan);
            break;
          }
          const crit = ((b >> 16) & 1) === 1;
          const element = (b >> 8) & 0xff;
          if (crit) sfx.play('hit.crit', pan);
          else if (element < HIT_IDS.length) sfx.play(HIT_IDS[element], pan, 0.8);
          else sfx.play('hit', pan);
          break;
        }
        case EV.KILL:
          sfx.play(b === 255 ? 'boss.death' : v >= 5 ? 'kill.big' : 'kill', pan);
          break;
        case EV.PLAYER_HURT:
          sfx.play('player.hurt');
          e.duck(-4, 0.02, 0.15, 0.5);
          break;
        case EV.PLAYER_REVIVE:
          sfx.play('eveil.start');
          e.duck(-6, 0.02, 0.6, 1);
          break;
        case EV.PLAYER_DEATH:
          sfx.play('player.death');
          e.duck(-10, 0.05, 1.2, 2);
          break;
        case EV.FIRE:
          if (b < FIRE_IDS.length) sfx.play(FIRE_IDS[b], pan, 0.7);
          break;
        case EV.REACTION:
          if (a < REACTION_IDS.length && !sfx.play(REACTION_IDS[a], pan)) sfx.play('reaction', pan);
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
          sfx.play('eveil.nova', pan);
          break;
        case EV.LEVEL_UP:
          sfx.play('levelup');
          e.duck(-5, 0.03, 0.4, 0.8);
          break;
        case EV.XP: {
          const now = e.now;
          this.xpCombo = now - this.xpTime < 0.6 ? this.xpCombo + 1 : 0;
          this.xpTime = now;
          sfx.play('xp', pan * 0.5, 1, 1 + Math.min(0.6, this.xpCombo * 0.025));
          break;
        }
        case EV.DASH:
          sfx.play('dash');
          // Accent du dash du personnage (sons existants).
          if (a < DASH_ACCENT.length && DASH_ACCENT[a]) sfx.play(DASH_ACCENT[a], 0, 0.7);
          break;
        case EV.DASH_END:
          if (a === 5) sfx.play('fire.singularity', pan, 0.7);
          else if (a === 6) sfx.play('boss.slam', pan, 0.6);
          else if (a === 11) sfx.play('freeze', pan);
          break;
        case EV.PACT:
          sfx.play('altar.sacrifice');
          break;
        case EV.ENEMY_SHOT:
          sfx.play(b === 1 ? 'boss.shot' : 'enemy.shot', pan);
          break;
        case EV.EXPLOSION:
          // 5 : obus de mortier ; 7 : surgissement (son porté par l'action d'ennemi).
          if (a === 5) sfx.play('mortar.impact', pan);
          else if (a !== 7) sfx.play(a === 1 ? 'mine' : 'explosion', pan);
          break;
        case EV.BLINK:
          sfx.play('blink', pan);
          break;
        case EV.TELEGRAPH:
          if (a === TELEGRAPH_KIND.KAMIKAZE) sfx.play('telegraph.fuse', pan);
          else if (a === TELEGRAPH_KIND.SHOOTER) sfx.play('telegraph.charge', pan, 0.7);
          else if (a === TELEGRAPH_KIND.BOSS) sfx.play('telegraph.boss', pan);
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
          // Mini-boss vaincu : retour à la musique du stage (le stage 1 sert à tous jusqu'en 4.13).
          if (b === 1) void e.music?.play('stage', 1);
          break;
        case EV.STRIKE:
          if (b < FIRE_IDS.length) sfx.play(FIRE_IDS[b], pan, 0.8);
          break;
        case EV.CHEST_DROP:
          sfx.play('chest.drop', pan);
          break;
        case EV.CHEST_OPEN:
          e.duck(-6, 0.03, 0.8, 1);
          break;
        case EV.EVOLUTION:
          e.duck(-8, 0.03, 1.2, 1.5);
          break;
        case EV.ELITE_SPAWN:
          sfx.play('elite.spawn', pan);
          break;
        case EV.EVEIL_FINALE:
          if (!sfx.play('eveil.finale')) sfx.play('boss.slam', 0, 1.2);
          e.duck(-6, 0.02, 0.4, 1);
          break;
        case EV.BOSS_SLAM:
          sfx.play('boss.slam', pan);
          break;
        case EV.FREEZE:
          sfx.play('freeze', pan, 0.8);
          break;
        case EV.SHIELD_BREAK:
          sfx.play('shield.break', pan);
          break;
        case EV.ENEMY_ACTION: {
          const id = ACTION_IDS[a];
          if (id) sfx.play(id, pan);
          break;
        }
        case EV.RUN_EVENT:
          if (b === RUN_EVENT_PHASE.APPEAR) {
            const id = APPEAR_IDS[a];
            if (id) sfx.play(id);
            e.duck(-4, 0.03, 0.6, 1);
          } else if (a === RUN_EVENT_KIND.RIFT && b === RUN_EVENT_PHASE.ACTIVATE) {
            this.rift = true;
            sfx.play('rift.enter');
            e.setRift(true);
          } else if (a === RUN_EVENT_KIND.RIFT && b === RUN_EVENT_PHASE.END && this.rift) {
            this.rift = false;
            sfx.play('rift.exit');
            e.setRift(false);
          }
          break;
        case EV.COIN:
          sfx.play('coin', pan * 0.5);
          break;
        case EV.PLAYER_SLOWED:
          sfx.play('player.slowed');
          break;
        case EV.PURCHASE:
          sfx.play('shop.buy');
          break;
        case EV.SACRIFICE:
          sfx.play('altar.sacrifice');
          e.duck(-6, 0.03, 0.8, 1.2);
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
  }

  update(sim: RunSim, dt: number, paused: boolean): void {
    const e = this.engine;
    const st = sim.state;
    // Menus en jeu (cartes, coffre, marchand, autel) : musique feutrée.
    const menu =
      st.status === 'levelup' ||
      st.status === 'chest' ||
      st.status === 'merchant' ||
      st.status === 'altar';
    e.setPaused(paused || menu);
    const m = e.music;
    if (!m || paused || st.status !== 'running') return;
    const p = st.player.eid;
    const px = Pos.x[p];
    const py = Pos.y[p];
    const pool = sim.world.enemies;
    const r2 = NEARBY_RADIUS * NEARBY_RADIUS;
    let nearby = 0;
    let elites = 0;
    for (let i = 0; i < pool.count; i++) {
      const en = pool.active[i];
      const dx = Pos.x[en] - px;
      const dy = Pos.y[en] - py;
      if (dx * dx + dy * dy < r2) {
        nearby++;
        elites += Foe.elite[en];
      }
    }
    // La horde dorée pousse la musique comme deux élites.
    if (st.events.hordeT > 0) elites += 2;
    const boss = st.boss.eid >= 0 && sim.world.boss.isActive(st.boss.eid);
    const hp = st.player.hp / Math.max(1, st.player.stats.maxHp);
    m.update(rawIntensity(nearby, hp, elites, boss), dt);
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
