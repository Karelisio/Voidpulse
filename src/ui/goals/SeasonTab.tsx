/** Passe de saison gratuit : bannière, progression et piste des 50 paliers. */
import type { CSSProperties } from 'react';
import { META, RETENTION } from '../../content/data';
import { t, useLang } from '../../i18n';
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
  const relic =
    r.relic === undefined ? '' : ` · ${t('goals.relicMin', { rarity: rarityName(r.relic) })}`;
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
  useLang();
  const r = tierReward(tier);
  const state = claimed ? 'claimed' : reached ? 'ready' : 'locked';
  const kind =
    r.relic !== undefined ? ' relic' : tier % S.rewards.milestoneEvery === 0 ? ' milestone' : '';
  const color =
    r.relic === undefined ? undefined : RARITIES[Math.min(r.relic, RARITIES.length - 1)].color;
  const label = t('goals.tierAria', {
    n: tier,
    reward: rewardText(tier),
    state: t(claimed ? 'goals.stateClaimed' : reached ? 'goals.stateReady' : 'goals.stateLocked'),
  });
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
  useLang();
  const info = seasonInfo(now);
  const s = data.retention.season;
  const tier = seasonTier(data);
  const max = tier >= S.tiers;
  const inTier = max ? S.xpPerTier : s.xp % S.xpPerTier;
  const claimed = new Set(s.claimed);
  const open = Array.from({ length: tier }, (_, i) => i + 1).filter((tr) => !claimed.has(tr));

  const claim = (tr: number): void => {
    if (!act((d) => claimSeasonTier(d, tr))) return;
    sfx('ui.confirm');
    notify(t('goals.tierClaimed', { n: tr, reward: rewardText(tr) }));
  };
  const claimAll = (): void => {
    const n = act((d) => claimAllSeason(d));
    if (n === 0) return;
    sfx('ui.confirm');
    const frags = open.reduce((sum, tr) => sum + tierReward(tr).fragments, 0);
    const relics = open.filter((tr) => tierReward(tr).relic !== undefined).length;
    const head = t(n > 1 ? 'goals.tiersClaimedMany' : 'goals.tiersClaimedOne', {
      n,
      frags: fmt(frags),
    });
    const tail =
      relics > 0
        ? ` · ${t(relics > 1 ? 'goals.relicsMany' : 'goals.relicsOne', { n: relics })}`
        : '';
    notify(head + tail);
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
            {t('goals.seasonN', { n: info.index + 1 })} ·{' '}
            {info.daysLeft <= 1
              ? t('goals.endsToday')
              : t('goals.endsIn', { time: t('core.days', { n: info.daysLeft }) })}
          </small>
        </div>
        <p className="meta-intro">{info.theme.description}</p>
        <div className="goals-tierbox">
          <div className="goals-tier-big">
            <small>{t('goals.tier')}</small>
            <b>{tier}</b>
          </div>
          <div className="goals-tier-xp">
            <div
              className="goals-bar"
              role="progressbar"
              aria-label={t('goals.xpToNext')}
              aria-valuemin={0}
              aria-valuemax={S.xpPerTier}
              aria-valuenow={inTier}
            >
              <i style={{ width: `${String(Math.floor((inTier / S.xpPerTier) * 100))}%` }} />
            </div>
            <span className="goals-num">
              {max
                ? t('goals.maxTier')
                : t('goals.xpProgress', { a: fmt(inTier), b: fmt(S.xpPerTier) })}
            </span>
            <span className="goals-num muted">
              {t('goals.tierSummary', { tier, max: S.tiers, xp: fmt(s.xp) })}
            </span>
          </div>
        </div>
        {open.length > 0 && (
          <button id="season-claim-all" className="goals-claim wide" onClick={claimAll}>
            {t('goals.claimAll', { n: open.length })}
          </button>
        )}
      </section>
      <section className="goals-track" aria-label={t('goals.track')}>
        {Array.from({ length: S.tiers }, (_, i) => i + 1).map((tr) => (
          <Tier
            key={tr}
            tier={tr}
            reached={tr <= tier}
            claimed={claimed.has(tr)}
            onClaim={() => {
              claim(tr);
            }}
          />
        ))}
      </section>
      <p className="meta-intro goals-hint">{t('goals.seasonHint')}</p>
    </>
  );
}
