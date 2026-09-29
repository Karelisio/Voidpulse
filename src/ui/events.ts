/** Modèles d'affichage des événements de run : offres du marchand, offrandes de l'autel. */
import { PASSIVES, RUN_EVENTS, WEAPONS } from '../content/data';
import type { AltarOffer, AltarOfferKind, AltarResult, MerchantOffer } from '../systems/state';

type Icons = Readonly<Partial<Record<string, string>>>;

export interface OfferView {
  title: string;
  detail: string;
  icon: string;
  price: number;
  sold: boolean;
  affordable: boolean;
}

export interface MerchantView {
  gold: number;
  offers: OfferView[];
}

export function merchantView(offers: readonly MerchantOffer[], gold: number, icons: Icons) {
  return {
    gold: Math.floor(gold),
    offers: offers.map((o) => offerView(o, gold, icons)),
  } satisfies MerchantView;
}

function offerView(o: MerchantOffer, gold: number, icons: Icons): OfferView {
  const base = { price: o.price, sold: o.sold, affordable: gold >= o.price };
  switch (o.item) {
    case 'heal':
      return {
        ...base,
        title: 'Soins complets',
        detail: 'Rend tous vos PV.',
        icon: icons.heal ?? '',
      };
    case 'weapon': {
      const w = WEAPONS[o.index];
      return {
        ...base,
        title: `Forge : ${w.name}`,
        detail: `Passe au niveau ${String(o.value)}.`,
        icon: icons[w.id] ?? '',
      };
    }
    case 'passive': {
      const p = PASSIVES[o.index];
      return {
        ...base,
        title: p.name,
        detail:
          o.value > 1 ? `Passe au niveau ${String(o.value)}. ${p.description}` : p.description,
        icon: icons[p.id] ?? '',
      };
    }
    case 'maxhp':
      return {
        ...base,
        title: 'Cœur renforcé',
        detail: `+${String(o.value)} PV max pour la run.`,
        icon: icons.vitality ?? '',
      };
    case 'reroll':
      return {
        ...base,
        title: 'Relances',
        detail: `+${String(o.value)} relances des cartes de niveau.`,
        icon: icons.clover ?? '',
      };
    case 'chest':
      return {
        ...base,
        title: 'Coffre scellé',
        detail: "Un coffre d'élite, posé à vos pieds au départ du marchand.",
        icon: icons.gold ?? '',
      };
  }
}

export interface SacrificeView {
  kind: AltarOfferKind;
  title: string;
  cost: string;
  gift: string;
  available: boolean;
  reason: string | null;
}

const pct = (x: number): string => `${String(Math.round(x * 100))} %`;

export function altarView(offers: readonly AltarOffer[]): SacrificeView[] {
  const a = RUN_EVENTS.altar;
  return offers.map((o) => {
    switch (o.kind) {
      case 'blood':
        return {
          kind: o.kind,
          title: 'Offrande de sang',
          cost: `Perdez ${pct(a.blood.cost)} de vos PV actuels.`,
          gift: `Un coffre d'élite à ${String(a.blood.rewards)} récompenses.`,
          available: o.available,
          reason: o.available ? null : 'Trop affaibli.',
        };
      case 'flesh':
        return {
          kind: o.kind,
          title: 'Offrande de chair',
          cost: `−${String(a.flesh.cost)} PV max pour la run.`,
          gift: `+${pct(a.flesh.damage)} de dégâts pour la run.`,
          available: o.available,
          reason: o.available ? null : 'PV max trop bas.',
        };
      case 'gold':
        return {
          kind: o.kind,
          title: "Offrande d'or",
          cost: `Perdez la moitié de votre or (au moins ${String(a.gold.min)}).`,
          gift: 'Une évolution si possible, sinon deux niveaux d’armes.',
          available: o.available,
          reason: o.available ? null : "Pas assez d'or.",
        };
    }
  });
}

/** Résultat d'une offrande, en une phrase. */
export function altarResultText(r: AltarResult): string {
  switch (r.kind) {
    case 'chest':
      return `Un coffre de ${String(r.value)} récompenses vous attend.`;
    case 'damage':
      return `+${pct(r.value)} de dégâts.`;
    case 'evolution':
      return `Évolution : ${WEAPONS[r.weapons[0]].evolution.name} !`;
    case 'levels':
      return r.weapons.map((i) => `${WEAPONS[i].name} +1`).join(' · ');
    case 'heal':
      return 'Rien à améliorer : vos blessures se referment.';
  }
}
