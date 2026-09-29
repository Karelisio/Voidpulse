/**
 * Tutoriel de la première partie : bandeaux contextuels, chacun déclenché par le moment ou par
 * l'événement qu'il explique (premier niveau, première réaction, jauge pleine), une seule fois.
 */
import { t, type TKey } from '../i18n';
import type { Hud } from '../render/hud';
import { RESONANCE } from '../content/data';
import type { RunSim } from '../systems/sim';

interface Step {
  title: TKey;
  body: TKey;
  ready(sim: RunSim): boolean;
}

const STEPS: Step[] = [
  { title: 'tutorial.moveTitle', body: 'tutorial.move', ready: (s) => s.state.time > 1 },
  { title: 'tutorial.dashTitle', body: 'tutorial.dash', ready: (s) => s.state.time > 9 },
  { title: 'tutorial.gemsTitle', body: 'tutorial.gems', ready: (s) => s.state.time > 17 },
  {
    title: 'tutorial.reactionTitle',
    body: 'tutorial.reaction',
    ready: (s) => s.state.resonance.countById.some((n) => n > 0),
  },
  {
    title: 'tutorial.eveilTitle',
    body: 'tutorial.eveil',
    ready: (s) => s.state.resonance.gauge >= RESONANCE.gaugeMax * 0.85,
  },
];

/** Temps minimal entre deux bandeaux (s) : le joueur a le temps de lire. */
const GAP = 7;

export class Tutorial {
  private index = 0;
  private cooldown = 0;

  get done(): boolean {
    return this.index >= STEPS.length;
  }

  update(sim: RunSim, hud: Hud, dt: number): void {
    if (this.done || sim.state.status !== 'running') return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const step = STEPS[this.index];
    if (!step.ready(sim)) return;
    hud.banner(t(step.title), t(step.body), 0x3ee6ff, 5);
    this.index++;
    this.cooldown = GAP;
  }
}
