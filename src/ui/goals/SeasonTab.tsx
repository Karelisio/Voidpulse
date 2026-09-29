/** Passe de saison gratuit : bannière, progression et piste des 50 paliers. */
import type { CSSProperties } from 'react';
import { META, RETENTION } from '../../content/data';
import {
  claimAllSeason,
  claimSeasonTier,
  seasonInfo,
  seasonTier,
  tierReward,
} from '../../meta/season';
import type { RelicItem, SaveData } from '../../save/schema';
import { fmt, sfx } from '../meta/common';
import { RelicBadge } from '../meta/RelicBadge';
import { type Act, type Notify } from './format';

const S = RETENTION.season;
const RARITIES = META.relics.rarities;

/** Relique fictive (couleur de la rareté minimale) pour l'affichage d'une récompense. */
const relicSample = (rarity: number): RelicItem => ({
  uid: 0,
  base: '',
  rarity,
  level: 1,
  stats: [],
});

const rarityName = (i: number): string => RARITIES[Math.min(i, RARITIES.length - 1)].name;

function rewardText(tier: number): string {
  const r = tierReward(tier);
  const relic = r.relic === undefined ? '' : ` · relique ${rarityName(r.relic)} minimum`;
  return `+${fmt(r.fragments)} ◆${relic}`;
}

function Tier({
  tier,
  reached,
  claimed,
  onClaim,
}: {
  tier: number;
  reached: boolean;
  claimed: boolean;
  onClaim: () => void;
}) {
  const r = tierReward(tier);
  const state = claimed ? 'claimed' : reached ? 'ready' : 'locked';
  const kind =
    r.relic !== undefined ? ' relic' : tier % S.rewards.milestoneEvery === 0 ? ' milestone' : '';
  const color =
    r.relic === undefined ? undefined : RARITIES[Math.min(r.relic, RARITIES.length - 1)].color;
  const label = `Palier ${String(tier)} : ${rewardText(tier)}${
    claimed ? ', réclamé' : reached ? ', à réclamer' : ', verrouillé'
  }`;
  return (
    <button
      className={`goals-tier ${state}${kind}`}
      style={color === undefined ? undefined : ({ '--tone': color } as CSSProperties)}
      disabled={state !== 'ready'}
      aria-label={label}
      onClick={onClaim}
    >
      <small className="goals-tier-n">{tier}</small>
      {r.relic !== undefined && <RelicBadge item={relicSample(r.relic)} size={30} />}
      <span className="goals-tier-r">
        {fmt(r.fragments)} <b>◆</b>
      </span>
      {claimed && (
        <i className="goals-tier-check" aria-hidden="true">
          ✓
        </i>
      )}
    </button>
  );
}

export function SeasonTab({
  data,
  now,
  act,
  notify,
}: {
  data: SaveData;
  now: number;
  act: Act;
  notify: Notify;
}) {
  const info = seasonInfo(now);
  const s = data.retention.season;
  const tier = seasonTier(data);
  const max = tier >= S.tiers;
  const inTier = max ? S.xpPerTier : s.xp % S.xpPerTier;
  const claimed = new Set(s.claimed);
  const open = Array.from({ length: tier }, (_, i) => i + 1).filter((t) => !claimed.has(t));

  const claim = (t: number): void => {
    if (!act((d) => claimSeasonTier(d, t))) return;
    sfx('ui.confirm');
    notify(`Palier ${String(t)} réclamé : ${rewardText(t)}`);
  };
  const claimAll = (): void => {
    const n = act((d) => claimAllSeason(d));
    if (n === 0) return;
    sfx('ui.confirm');
    const frags = open.reduce((sum, t) => sum + tierReward(t).fragments, 0);
    const relics = open.filter((t) => tierReward(t).relic !== undefined).length;
    notify(
      `${String(n)} palier${n > 1 ? 's' : ''} réclamé${n > 1 ? 's' : ''} : +${fmt(frags)} ◆${
        relics > 0 ? ` · ${String(relics)} relique${relics > 1 ? 's' : ''}` : ''
      }`,
    );
  };

  return (
    <>
      <section
        className="meta-panel goals-banner"
        style={{ '--tone': info.theme.color } as CSSProperties}
      >
        <div className="goals-banner-head">
          <h3>{info.theme.name}</h3>
          <small>
            Saison {info.index + 1} ·{' '}
            {info.daysLeft <= 1
              ? 'se termine aujourd’hui'
              : `se termine dans ${String(info.daysLeft)} j`}
          </small>
        </div>
        <p className="meta-intro">{info.theme.description}</p>
        <div className="goals-tierbox">
          <div className="goals-tier-big">
            <small>Palier</small>
            <b>{tier}</b>
          </div>
          <div className="goals-tier-xp">
            <div
              className="goals-bar"
              role="progressbar"
              aria-label="XP vers le prochain palier"
              aria-valuemin={0}
              aria-valuemax={S.xpPerTier}
              aria-valuenow={inTier}
            >
              <i style={{ width: `${String(Math.floor((inTier / S.xpPerTier) * 100))}%` }} />
            </div>
            <span className="goals-num">
              {max ? 'Palier maximal atteint' : `${fmt(inTier)} / ${fmt(S.xpPerTier)} XP`}
            </span>
            <span className="goals-num muted">
              Palier {tier} / {S.tiers} · {fmt(s.xp)} XP au total
            </span>
          </div>
        </div>
        {open.length > 0 && (
          <button id="season-claim-all" className="goals-claim wide" onClick={claimAll}>
            Tout réclamer ({open.length})
          </button>
        )}
      </section>
      <section className="goals-track" aria-label="Paliers de la saison">
        {Array.from({ length: S.tiers }, (_, i) => i + 1).map((t) => (
          <Tier
            key={t}
            tier={t}
            reached={t <= tier}
            claimed={claimed.has(t)}
            onClaim={() => {
              claim(t);
            }}
          />
        ))}
      </section>
      <p className="meta-intro goals-hint">
        L’XP vient des parties (score) et des quêtes. Les paliers atteints et non réclamés sont
        versés à la fin de la saison. Les reliques ont la rareté indiquée par leur couleur, au
        minimum.
      </p>
    </>
  );
}
