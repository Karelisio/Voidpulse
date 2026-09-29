/** Quêtes du jour et de la semaine : progression, récompenses, relance quotidienne. */
import type { CSSProperties } from 'react';
import { t, useLang } from '../../i18n';
import { claimQuest, questReward, questTemplate, questText, rerollQuest } from '../../meta/quests';
import type { QuestPeriod } from '../../meta/quests';
import type { QuestSlot, SaveData } from '../../save/schema';
import { fmt, sfx } from '../meta/common';
import { iconUrl } from '../portraits';
import {
  fmtDuration,
  fmtValue,
  isDecimal,
  nextMidnight,
  nextMonday,
  questIcon,
  type Act,
  type Notify,
} from './format';

interface Shared {
  act: Act;
  notify: Notify;
}

function QuestCard({
  slot,
  period,
  index,
  rerolls,
  act,
  notify,
}: {
  slot: QuestSlot;
  period: QuestPeriod;
  index: number;
  rerolls: number;
} & Shared) {
  useLang();
  const tpl = questTemplate(slot.id);
  const reward = questReward(period);
  const complete = slot.progress >= slot.target;
  const ready = complete && !slot.claimed;
  const ratio = Math.min(1, slot.progress / slot.target);
  const decimal = isDecimal(tpl?.metric ?? '');
  const tone = tpl?.element
    ? `var(--vp-${tpl.element})`
    : period === 'daily'
      ? 'var(--vp-accent-2)'
      : 'var(--vp-accent)';

  const claim = (): void => {
    if (!act((d) => claimQuest(d, period, index))) return;
    sfx('ui.confirm');
    notify(t('goals.questClaimed', { frags: fmt(reward.fragments), xp: fmt(reward.seasonXp) }));
  };
  const reroll = (): void => {
    if (!act((d) => rerollQuest(d, index))) return;
    sfx('ui.card');
    notify(t('goals.questReplaced'));
  };

  return (
    <li
      className={`goals-quest${ready ? ' ready' : ''}${slot.claimed ? ' claimed' : ''}`}
      style={{ '--tone': tone } as CSSProperties}
    >
      <img
        className="goals-quest-icon"
        src={iconUrl(questIcon(tpl))}
        alt=""
        width={40}
        height={40}
      />
      <div className="goals-quest-body">
        <p className="goals-quest-text">{questText(slot)}</p>
        <div className="goals-progress">
          <div
            className="goals-bar"
            role="progressbar"
            aria-label={t('goals.questProgress')}
            aria-valuemin={0}
            aria-valuemax={slot.target}
            aria-valuenow={Math.min(slot.progress, slot.target)}
          >
            <i style={{ width: `${String(Math.floor(ratio * 100))}%` }} />
          </div>
          <span className="goals-num">
            {fmtValue(slot.progress, slot.target, decimal)} /{' '}
            {fmtValue(slot.target, slot.target, decimal)}
          </span>
        </div>
      </div>
      <div className="goals-quest-foot">
        <span className="goals-reward">
          +{fmt(reward.fragments)} <b>◆</b> · {t('goals.seasonXp', { n: fmt(reward.seasonXp) })}
        </span>
        <span className="goals-actions">
          {period === 'daily' && !slot.claimed && !complete && rerolls > 0 && (
            <button className="btn-ghost goals-reroll" onClick={reroll}>
              {t('goals.reroll', { n: rerolls })}
            </button>
          )}
          {slot.claimed ? (
            <span className="goals-done">{t('goals.claimedTag')}</span>
          ) : (
            <button className="goals-claim" disabled={!ready} onClick={claim}>
              {t('goals.claim')}
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

function Section({
  title,
  period,
  slots,
  remain,
  rerolls,
  act,
  notify,
}: {
  title: string;
  period: QuestPeriod;
  slots: QuestSlot[];
  remain: number;
  rerolls: number;
} & Shared) {
  useLang();
  return (
    <section className="goals-section" aria-label={title}>
      <div className="goals-section-head">
        <h3>{title}</h3>
        <small>{t('goals.renewIn', { time: fmtDuration(remain) })}</small>
      </div>
      <ul className="goals-list">
        {slots.map((slot, i) => (
          <QuestCard
            key={`${slot.id}-${String(i)}`}
            slot={slot}
            period={period}
            index={i}
            rerolls={rerolls}
            act={act}
            notify={notify}
          />
        ))}
      </ul>
    </section>
  );
}

export function QuestsTab({ data, now, act, notify }: Shared & { data: SaveData; now: number }) {
  useLang();
  const q = data.retention.quests;
  return (
    <>
      <Section
        title={t('goals.daily')}
        period="daily"
        slots={q.daily}
        remain={nextMidnight(now) - now}
        rerolls={q.rerolls}
        act={act}
        notify={notify}
      />
      <Section
        title={t('goals.weekly')}
        period="weekly"
        slots={q.weekly}
        remain={nextMonday(now) - now}
        rerolls={0}
        act={act}
        notify={notify}
      />
      <p className="meta-intro goals-hint">{t('goals.questsHint')}</p>
    </>
  );
}
