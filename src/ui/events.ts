/** Modèles d'affichage des événements de run : offres du marchand, offrandes de l'autel. */
import { PASSIVES, RUN_EVENTS, WEAPONS } from '../content/data';
import { t } from '../i18n';
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
        title: t('run.offerHealTitle'),
        detail: t('run.offerHealDetail'),
        icon: icons.heal ?? '',
      };
    case 'weapon': {
      const w = WEAPONS[o.index];
      return {
        ...base,
        title: t('run.offerForge', { name: w.name }),
        detail: t('run.offerLevelTo', { n: o.value }),
        icon: icons[w.id] ?? '',
      };
    }
    case 'passive': {
      const p = PASSIVES[o.index];
      return {
        ...base,
        title: p.name,
        detail:
          o.value > 1
            ? t('run.offerLevelToDesc', { n: o.value, desc: p.description })
            : p.description,
        icon: icons[p.id] ?? '',
      };
    }
    case 'maxhp':
      return {
        ...base,
        title: t('run.offerMaxHpTitle'),
        detail: t('run.offerMaxHpDetail', { n: o.value }),
        icon: icons.vitality ?? '',
      };
    case 'reroll':
      return {
        ...base,
        title: t('run.offerRerollTitle'),
        detail: t('run.offerRerollDetail', { n: o.value }),
        icon: icons.clover ?? '',
      };
    case 'chest':
      return {
        ...base,
        title: t('run.offerChestTitle'),
        detail: t('run.offerChestDetail'),
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

const pct = (x: number): string => t('run.pct', { n: Math.round(x * 100) });

export function altarView(offers: readonly AltarOffer[]): SacrificeView[] {
  const a = RUN_EVENTS.altar;
  return offers.map((o) => {
    switch (o.kind) {
      case 'blood':
        return {
          kind: o.kind,
          title: t('run.bloodTitle'),
          cost: t('run.bloodCost', { pct: pct(a.blood.cost) }),
          gift: t('run.bloodGift', { n: a.blood.rewards }),
          available: o.available,
          reason: o.available ? null : t('run.bloodReason'),
        };
      case 'flesh':
        return {
          kind: o.kind,
          title: t('run.fleshTitle'),
          cost: t('run.fleshCost', { n: a.flesh.cost }),
          gift: t('run.fleshGift', { pct: pct(a.flesh.damage) }),
          available: o.available,
          reason: o.available ? null : t('run.fleshReason'),
        };
      case 'gold':
        return {
          kind: o.kind,
          title: t('run.goldOfferTitle'),
          cost: t('run.goldOfferCost', { n: a.gold.min }),
          gift: t('run.goldOfferGift'),
          available: o.available,
          reason: o.available ? null : t('run.goldOfferReason'),
        };
    }
  });
}

/** Résultat d'une offrande, en une phrase. */
export function altarResultText(r: AltarResult): string {
  switch (r.kind) {
    case 'chest':
      return t('run.resultChest', { n: r.value });
    case 'damage':
      return t('run.resultDamage', { pct: pct(r.value) });
    case 'evolution':
      return t('run.resultEvolution', { name: WEAPONS[r.weapons[0]].evolution.name });
    case 'levels':
      return r.weapons.map((i) => `${WEAPONS[i].name} +1`).join(' · ');
    case 'heal':
      return t('run.resultHeal');
  }
}
