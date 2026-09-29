/** Quêtes du jour et de la semaine : progression, récompenses, relance quotidienne. */
import type { CSSProperties } from 'react';
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
  const t = questTemplate(slot.id);
  const reward = questReward(period);
  const complete = slot.progress >= slot.target;
  const ready = complete && !slot.claimed;
  const ratio = Math.min(1, slot.progress / slot.target);
  const decimal = isDecimal(t?.metric ?? '');
  const tone = t?.element
    ? `var(--vp-${t.element})`
    : period === 'daily'
      ? 'var(--vp-accent-2)'
      : 'var(--vp-accent)';

  const claim = (): void => {
    if (!act((d) => claimQuest(d, period, index))) return;
    sfx('ui.confirm');
    notify(`Quête réclamée : +${fmt(reward.fragments)} ◆ · +${fmt(reward.seasonXp)} XP de saison`);
  };
  const reroll = (): void => {
    if (!act((d) => rerollQuest(d, index))) return;
    sfx('ui.card');
    notify('Quête remplacée');
  };

  return (
    <li
      className={`goals-quest${ready ? ' ready' : ''}${slot.claimed ? ' claimed' : ''}`}
      style={{ '--tone': tone } as CSSProperties}
    >
      <img className="goals-quest-icon" src={iconUrl(questIcon(t))} alt="" width={40} height={40} />
      <div className="goals-quest-body">
        <p className="goals-quest-text">{questText(slot)}</p>
        <div className="goals-progress">
          <div
            className="goals-bar"
            role="progressbar"
            aria-label="Progression de la quête"
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
          +{fmt(reward.fragments)} <b>◆</b> · +{fmt(reward.seasonXp)} XP de saison
        </span>
        <span className="goals-actions">
          {period === 'daily' && !slot.claimed && !complete && rerolls > 0 && (
            <button className="btn-ghost goals-reroll" onClick={reroll}>
              Relancer ({rerolls})
            </button>
          )}
          {slot.claimed ? (
            <span className="goals-done">✓ Réclamée</span>
          ) : (
            <button className="goals-claim" disabled={!ready} onClick={claim}>
              Réclamer
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
  return (
    <section className="goals-section" aria-label={title}>
      <div className="goals-section-head">
        <h3>{title}</h3>
        <small>renouvelées dans {fmtDuration(remain)}</small>
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
  const q = data.retention.quests;
  return (
    <>
      <Section
        title="Du jour"
        period="daily"
        slots={q.daily}
        remain={nextMidnight(now) - now}
        rerolls={q.rerolls}
        act={act}
        notify={notify}
      />
      <Section
        title="De la semaine"
        period="weekly"
        slots={q.weekly}
        remain={nextMonday(now) - now}
        rerolls={0}
        act={act}
        notify={notify}
      />
      <p className="meta-intro goals-hint">
        La progression compte à la fin de chaque partie (hors entraînement).
      </p>
    </>
  );
}
