/**
 * Événements de run : marchand ambulant, autel de sacrifice, horde dorée, faille temporelle.
 * Calendrier imposé par le stage ou tiré au hasard (tous les types passent avant une
 * répétition), jamais pendant le boss ni juste avant. Les décors (marchand, autel, faille) sont
 * des zones (zones.ts) ; leurs effets et les commandes de l'interface sont ici.
 */
import { PASSIVES, PROGRESSION, RUN_EVENTS, enemyIndex } from '../content/data';
import { Foe, Pos } from '../engine/components';
import { DT } from '../engine/constants';
import { spawnEnemy } from './enemies';
import { EV, RUN_EVENT_KIND, RUN_EVENT_PHASE } from './events';
import { openChest } from './loot';
import { healPlayer } from './player';
import { dropChest } from './pickups';
import { openLevelUp, refreshStats } from './progression';
import type { RunSim } from './sim';
import type {
  AltarOfferKind,
  AltarResult,
  MerchantItem,
  MerchantOffer,
  RunEventKind,
  RunEventsState,
} from './state';
import { canEvolve, evolveWeapon, levelUpWeapon, maxWeaponLevel } from './weapons';
import { despawnZones, spawnZone, ZONE } from './zones';

const KINDS: readonly RunEventKind[] = ['merchant', 'altar', 'horde', 'rift'];
const HORDE_TYPE = enemyIndex(RUN_EVENTS.horde.enemy);
const TAU = Math.PI * 2;
/** Distance d'arrivée des lignes de la horde dorée. */
const HORDE_DISTANCE = 620;

export function createRunEvents(): RunEventsState {
  return {
    nextAt: RUN_EVENTS.first,
    bag: 0,
    index: 0,
    hordeT: 0,
    hordeSpawnT: 0,
    riftT: 0,
    altarProgress: 0,
    count: 0,
    pendingChests: 0,
    pendingChestSize: 0,
  };
}

/** Calendrier et effets en cours (appelé par le director à chaque tick). */
export function updateRunEvents(sim: RunSim): void {
  const st = sim.state;
  const ev = st.events;
  const t = st.time;
  const p = st.player.eid;

  if (ev.riftT > 0) {
    ev.riftT -= DT;
    if (ev.riftT <= 0) {
      ev.riftT = 0;
      sim.events.push(
        EV.RUN_EVENT,
        RUN_EVENT_KIND.RIFT,
        RUN_EVENT_PHASE.END,
        Pos.x[p],
        Pos.y[p],
        0,
      );
    }
  }
  if (ev.hordeT > 0) {
    ev.hordeT -= DT;
    ev.hordeSpawnT -= DT;
    if (ev.hordeSpawnT <= 0 && ev.hordeT > 1) {
      ev.hordeSpawnT = RUN_EVENTS.horde.every;
      hordeLine(sim);
    }
    if (ev.hordeT <= 0) {
      ev.hordeT = 0;
      sim.events.push(
        EV.RUN_EVENT,
        RUN_EVENT_KIND.HORDE,
        RUN_EVENT_PHASE.END,
        Pos.x[p],
        Pos.y[p],
        0,
      );
    }
  }

  const planned = st.stage.runEvents;
  if (planned) {
    while (ev.index < planned.length && planned[ev.index][0] <= t) {
      startRunEvent(sim, planned[ev.index][1]);
      ev.index++;
    }
    return;
  }
  if (t < ev.nextAt) return;
  const bossNear =
    st.boss.eid >= 0 || (!st.director.bossSpawned && t > st.stage.bossAt - RUN_EVENTS.bossBuffer);
  if (bossNear) {
    ev.nextAt = t + 10;
    return;
  }
  // Sac : chaque type sort une fois avant qu'un type ne se répète.
  if (ev.bag === (1 << KINDS.length) - 1) ev.bag = 0;
  let options = 0;
  for (let k = 0; k < KINDS.length; k++) if ((ev.bag & (1 << k)) === 0) options++;
  let pick = Math.floor(sim.rng.spawn.next() * options);
  for (let k = 0; k < KINDS.length; k++) {
    if ((ev.bag & (1 << k)) !== 0) continue;
    if (pick-- === 0) {
      ev.bag |= 1 << k;
      startRunEvent(sim, KINDS[k]);
      break;
    }
  }
  const [lo, hi] = RUN_EVENTS.interval;
  ev.nextAt = t + sim.rng.spawn.range(lo, hi);
}

/** Déclenche un événement (aussi utilisé par le menu debug). */
export function startRunEvent(sim: RunSim, kind: RunEventKind): void {
  const st = sim.state;
  const p = st.player.eid;
  st.events.count++;
  st.stats.runEvents++;
  switch (kind) {
    case 'merchant':
      spawnProp(sim, ZONE.MERCHANT, RUN_EVENTS.merchant.radius, RUN_EVENTS.merchant.duration);
      break;
    case 'altar':
      spawnProp(sim, ZONE.ALTAR, RUN_EVENTS.altar.radius, RUN_EVENTS.altar.duration);
      break;
    case 'rift':
      spawnProp(sim, ZONE.RIFT, RUN_EVENTS.rift.radius, RUN_EVENTS.rift.duration);
      break;
    case 'horde':
      st.events.hordeT = RUN_EVENTS.horde.duration;
      st.events.hordeSpawnT = 0.8;
      sim.events.push(
        EV.RUN_EVENT,
        RUN_EVENT_KIND.HORDE,
        RUN_EVENT_PHASE.APPEAR,
        Pos.x[p],
        Pos.y[p],
        0,
      );
      break;
  }
}

/** Décor posé à distance du joueur (un seul de chaque type à la fois). */
function spawnProp(sim: RunSim, kind: number, r: number, dur: number): void {
  despawnZones(sim, kind);
  const p = sim.state.player.eid;
  const [lo, hi] = RUN_EVENTS.distance;
  const a = sim.rng.spawn.range(0, TAU);
  const d = sim.rng.spawn.range(lo, hi);
  const x = Pos.x[p] + Math.cos(a) * d;
  const y = Pos.y[p] + Math.sin(a) * d;
  if (spawnZone(sim, kind, x, y, r, dur, 0, 0) < 0) return;
  const code =
    kind === ZONE.MERCHANT
      ? RUN_EVENT_KIND.MERCHANT
      : kind === ZONE.ALTAR
        ? RUN_EVENT_KIND.ALTAR
        : RUN_EVENT_KIND.RIFT;
  sim.events.push(EV.RUN_EVENT, code, RUN_EVENT_PHASE.APPEAR, x, y, 0);
}

/** Horde dorée : une ligne de scarabées traverse l'écran près du joueur. */
function hordeLine(sim: RunSim): void {
  const p = sim.state.player.eid;
  const rng = sim.rng.spawn;
  const a = rng.range(0, TAU);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // Passe à côté du joueur (décalage latéral) : il faut aller à sa rencontre.
  const lateral = rng.range(-90, 90);
  const cx = Pos.x[p] + ca * HORDE_DISTANCE - sa * lateral;
  const cy = Pos.y[p] + sa * HORDE_DISTANCE + ca * lateral;
  const n = RUN_EVENTS.horde.count;
  const hpScale = sim.state.director.hpScale;
  for (let k = 0; k < n; k++) {
    const o = (k - (n - 1) / 2) * 30;
    const e = spawnEnemy(sim, HORDE_TYPE, cx - sa * o, cy + ca * o, hpScale);
    if (e < 0) return;
    Foe.tx[e] = -ca;
    Foe.ty[e] = -sa;
    Foe.face[e] = Math.atan2(-sa, -ca);
  }
}

// --- Faille temporelle --------------------------------------------------------------------

export function enterRift(sim: RunSim, x: number, y: number): void {
  sim.state.events.riftT = RUN_EVENTS.rift.time;
  sim.events.push(EV.RUN_EVENT, RUN_EVENT_KIND.RIFT, RUN_EVENT_PHASE.ACTIVATE, x, y, 0);
}

// --- Marchand -----------------------------------------------------------------------------

/** Contact avec le marchand : trois offres tirées au hasard, pause de la run. */
export function openMerchant(sim: RunSim): void {
  const st = sim.state;
  const m = RUN_EVENTS.merchant;
  const rng = sim.rng.loot;
  const scale = 1 + st.time / m.priceScale;
  const offers: MerchantOffer[] = [];
  const stock = m.stock.filter((s) => offerTarget(sim, s.id) !== null);
  while (offers.length < m.offers && stock.length > 0) {
    const s = stock.splice(Math.floor(rng.next() * stock.length), 1)[0];
    const target = offerTarget(sim, s.id);
    if (!target) continue;
    offers.push({
      item: s.id,
      index: target.index,
      value: s.id === 'heal' || s.id === 'chest' ? s.value : target.value || s.value,
      price: Math.round(s.price * scale),
      sold: false,
    });
  }
  st.merchant = { offers };
  st.status = 'merchant';
  const p = st.player.eid;
  sim.events.push(
    EV.RUN_EVENT,
    RUN_EVENT_KIND.MERCHANT,
    RUN_EVENT_PHASE.ACTIVATE,
    Pos.x[p],
    Pos.y[p],
    0,
  );
}

/** Cible d'une offre (arme ou passif à améliorer) ; null si l'offre est sans objet. */
function offerTarget(sim: RunSim, item: MerchantItem): { index: number; value: number } | null {
  const st = sim.state;
  const rng = sim.rng.loot;
  switch (item) {
    case 'weapon': {
      const up = st.weapons.filter((w) => !w.evolved && w.level < maxWeaponLevel(w.def));
      if (up.length === 0) return null;
      const w = up[Math.floor(rng.next() * up.length)];
      return { index: w.defIndex, value: w.level + 1 };
    }
    case 'passive': {
      const up = st.passives.filter((q) => q.level < q.def.maxLevel);
      if (up.length > 0) {
        const q = up[Math.floor(rng.next() * up.length)];
        return { index: q.defIndex, value: q.level + 1 };
      }
      if (st.passives.length >= PROGRESSION.maxPassives) return null;
      const owned = new Set(st.passives.map((q) => q.defIndex));
      const free = PASSIVES.map((_, i) => i).filter((i) => !owned.has(i));
      if (free.length === 0) return null;
      return { index: free[Math.floor(rng.next() * free.length)], value: 1 };
    }
    case 'heal':
      return st.player.hp < st.player.stats.maxHp ? { index: -1, value: 1 } : null;
    default:
      return { index: -1, value: 0 };
  }
}

/** Achat d'une offre ; renvoie false si elle est vendue ou trop chère. */
export function buy(sim: RunSim, i: number): boolean {
  const st = sim.state;
  const offer = st.merchant?.offers[i];
  if (st.status !== 'merchant' || !offer || offer.sold) return false;
  if (st.stats.fragments < offer.price) return false;
  st.stats.fragments -= offer.price;
  st.stats.spent += offer.price;
  offer.sold = true;
  switch (offer.item) {
    case 'heal':
      healPlayer(sim, st.player.stats.maxHp);
      break;
    case 'weapon': {
      const w = st.weapons.find((x) => x.defIndex === offer.index);
      if (w && !w.evolved && w.level < maxWeaponLevel(w.def)) levelUpWeapon(w);
      break;
    }
    case 'passive': {
      const q = st.passives.find((x) => x.defIndex === offer.index);
      if (q) q.level = Math.min(q.def.maxLevel, q.level + 1);
      else st.passives.push({ def: PASSIVES[offer.index], defIndex: offer.index, level: 1 });
      refreshStats(sim);
      break;
    }
    case 'maxhp':
      st.bonus.maxHp += offer.value;
      refreshStats(sim);
      break;
    case 'reroll':
      st.levelUp.rerolls += offer.value;
      break;
    case 'chest':
      st.events.pendingChests++;
      break;
  }
  sim.events.push(EV.PURCHASE, MERCHANT_ITEMS.indexOf(offer.item), 0, 0, 0, offer.price);
  return true;
}

export const MERCHANT_ITEMS: readonly MerchantItem[] = [
  'heal',
  'weapon',
  'passive',
  'maxhp',
  'reroll',
  'chest',
];

/** Départ du marchand : reprise (coffres achetés posés aux pieds du joueur). */
export function closeMerchant(sim: RunSim): void {
  const st = sim.state;
  if (st.status !== 'merchant') return;
  st.merchant = null;
  st.status = 'running';
  despawnZones(sim, ZONE.MERCHANT);
  const p = st.player.eid;
  sim.events.push(
    EV.RUN_EVENT,
    RUN_EVENT_KIND.MERCHANT,
    RUN_EVENT_PHASE.END,
    Pos.x[p],
    Pos.y[p],
    0,
  );
  for (; st.events.pendingChests > 0; st.events.pendingChests--) {
    dropChest(sim, Pos.x[p] + 34 * st.events.pendingChests, Pos.y[p] - 30);
  }
  if (st.player.pendingLevels > 0) openLevelUp(sim);
}

// --- Autel de sacrifice -------------------------------------------------------------------

export function openAltar(sim: RunSim): void {
  const st = sim.state;
  const a = RUN_EVENTS.altar;
  st.altar = {
    offers: [
      { kind: 'blood', available: st.player.hp > 2 },
      { kind: 'flesh', available: st.player.stats.maxHp > a.flesh.cost + 20 },
      { kind: 'gold', available: st.stats.fragments >= a.gold.min },
    ],
    chosen: null,
    result: null,
  };
  st.status = 'altar';
  const p = st.player.eid;
  sim.events.push(
    EV.RUN_EVENT,
    RUN_EVENT_KIND.ALTAR,
    RUN_EVENT_PHASE.ACTIVATE,
    Pos.x[p],
    Pos.y[p],
    0,
  );
}

/** Offrande : le prix est payé tout de suite, la récompense aussi (le coffre à la fermeture). */
export function sacrifice(sim: RunSim, kind: AltarOfferKind): boolean {
  const st = sim.state;
  const altar = st.altar;
  if (st.status !== 'altar' || !altar || altar.chosen) return false;
  if (!altar.offers.some((o) => o.kind === kind && o.available)) return false;
  const a = RUN_EVENTS.altar;
  const p = st.player;
  altar.chosen = kind;
  switch (kind) {
    case 'blood': {
      p.hp = Math.max(1, p.hp - p.hp * a.blood.cost);
      st.events.pendingChestSize = a.blood.rewards;
      altar.result = { kind: 'chest', weapons: [], value: a.blood.rewards };
      break;
    }
    case 'flesh':
      st.bonus.maxHp -= a.flesh.cost;
      st.bonus.damage += a.flesh.damage;
      refreshStats(sim);
      altar.result = { kind: 'damage', weapons: [], value: a.flesh.damage };
      break;
    case 'gold': {
      const cost = Math.max(a.gold.min, Math.floor(st.stats.fragments * a.gold.cost));
      st.stats.fragments = Math.max(0, st.stats.fragments - cost);
      st.stats.spent += cost;
      altar.result = goldBlessing(sim);
      break;
    }
  }
  sim.events.push(EV.SACRIFICE, kind === 'blood' ? 0 : kind === 'flesh' ? 1 : 2, 0, 0, 0, 0);
  return true;
}

/** Offrande d'or : évolution si possible, sinon deux niveaux d'armes, sinon soins complets. */
function goldBlessing(sim: RunSim): AltarResult {
  const st = sim.state;
  for (const w of st.weapons) {
    if (canEvolve(sim, w)) {
      evolveWeapon(sim, w);
      return { kind: 'evolution', weapons: [w.defIndex], value: 0 };
    }
  }
  const up = st.weapons.filter((w) => !w.evolved && w.level < maxWeaponLevel(w.def));
  if (up.length > 0) {
    const weapons: number[] = [];
    for (let k = 0; k < 2; k++) {
      const pool = up.filter((w) => w.level < maxWeaponLevel(w.def));
      if (pool.length === 0) break;
      const w = pool[Math.floor(sim.rng.loot.next() * pool.length)];
      levelUpWeapon(w);
      weapons.push(w.defIndex);
    }
    return { kind: 'levels', weapons, value: 0 };
  }
  healPlayer(sim, st.player.stats.maxHp);
  return { kind: 'heal', weapons: [], value: 0 };
}

/** Fin de l'autel (offrande faite ou refusée) : reprise, coffre éventuel. */
export function closeAltar(sim: RunSim): void {
  const st = sim.state;
  if (st.status !== 'altar') return;
  st.altar = null;
  st.status = 'running';
  despawnZones(sim, ZONE.ALTAR);
  const p = st.player.eid;
  sim.events.push(EV.RUN_EVENT, RUN_EVENT_KIND.ALTAR, RUN_EVENT_PHASE.END, Pos.x[p], Pos.y[p], 0);
  const size = st.events.pendingChestSize;
  if (size > 0) {
    st.events.pendingChestSize = 0;
    openChest(sim, size);
    return;
  }
  if (st.player.pendingLevels > 0) openLevelUp(sim);
}
