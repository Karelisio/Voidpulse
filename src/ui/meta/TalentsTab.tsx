/** Talents : quatre branches de huit paliers, deux nœuds par palier, achat de rangs en fragments. */
import { useState } from 'react';
import { TALENTS, type TalentNodeDef } from '../../content/data';
import { t, useLang } from '../../i18n';
import { formatStats, statLabel } from '../../meta/stats';
import {
  buyTalent,
  canBuy,
  nextCost,
  resetTalents,
  talentOpen,
  talentRank,
  talentSpent,
} from '../../meta/talents';
import type { SaveData } from '../../save/schema';
import { useSave } from '../../state/save';
import { fmt, mutate, scaled, sfx } from './common';
import { iconUrl } from '../portraits';

const TIERS = Math.max(...TALENTS.nodes.map((n) => n.tier)) + 1;

function nodeIcon(node: TalentNodeDef): string {
  const first = Object.keys(node.stats)[0] as string | undefined;
  return iconUrl(statLabel(first ?? 'damage').icon);
}

const effect = (node: TalentNodeDef): string => formatStats(node.stats).join(' · ');

function Node({
  data,
  node,
  selected,
  onSelect,
}: {
  data: SaveData;
  node: TalentNodeDef;
  selected: boolean;
  onSelect: () => void;
}) {
  useLang();
  const rank = talentRank(data, node.id);
  const state = canBuy(data, node);
  const cost = nextCost(data, node);
  return (
    <button
      id={`talent-${node.id}`}
      className={`meta-node ${state} ${selected ? 'sel' : ''} ${rank > 0 ? 'owned' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <img src={nodeIcon(node)} alt="" width={32} height={32} />
      <span className="meta-node-name">{node.name}</span>
      <span className="meta-node-rank num">
        {String(rank)}/{String(node.cost.length)}
      </span>
      <small className="meta-node-fx">{effect(node)}</small>
      <small className="meta-node-cost num">
        {state === 'maxed'
          ? t('meta.max')
          : state === 'locked'
            ? t('core.locked')
            : `◆ ${fmt(cost ?? 0)}`}
      </small>
    </button>
  );
}

export function TalentsTab() {
  useLang();
  const data = useSave((s) => s.data);
  const [branch, setBranch] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const b = TALENTS.branches[branch];
  const nodes = TALENTS.nodes.filter((n) => n.branch === b.id);
  const at = (tier: number, col: number): TalentNodeDef | undefined =>
    nodes.find((n) => n.tier === tier && n.col === col);
  const sel = TALENTS.nodes.find((n) => n.id === selected);
  const spent = talentSpent(data);
  const branchRanks = (id: string): number =>
    TALENTS.nodes.reduce((s, n) => s + (n.branch === id ? talentRank(data, n.id) : 0), 0);

  const detail = (node: TalentNodeDef) => {
    const rank = talentRank(data, node.id);
    const state = canBuy(data, node);
    const cost = nextCost(data, node);
    return (
      <section className="meta-sheet" aria-label={node.name}>
        <div className="meta-sheet-head">
          <img src={nodeIcon(node)} alt="" width={40} height={40} />
          <div>
            <h3>{node.name}</h3>
            <small className="muted num">
              {t('meta.talentRank', { rank, max: node.cost.length })}
            </small>
          </div>
        </div>
        <p className="meta-fx">
          {effect(node)} <span className="muted">{t('meta.perRank')}</span>
        </p>
        {rank > 0 && (
          <p className="muted num">
            {t('meta.current', { fx: formatStats(scaled(node.stats, rank)).join(' · ') })}
          </p>
        )}
        {state === 'locked' && <p className="muted">{t('meta.talentLockedHint')}</p>}
        <button
          className="btn-primary"
          id="talent-buy"
          disabled={state !== 'ok'}
          onClick={() => {
            sfx('ui.confirm');
            mutate((d) => {
              buyTalent(d, node.id);
            });
          }}
        >
          {state === 'maxed'
            ? t('meta.maxRank')
            : state === 'locked'
              ? t('core.locked')
              : t('meta.buy', { n: fmt(cost ?? 0) })}
        </button>
      </section>
    );
  };

  return (
    <>
      <div className="meta-subtabs" role="tablist" aria-label={t('meta.branches')}>
        {TALENTS.branches.map((br, i) => (
          <button
            key={br.id}
            id={`branch-${br.id}`}
            role="tab"
            aria-selected={i === branch}
            className={i === branch ? 'on' : ''}
            onClick={() => {
              sfx('ui.click');
              setBranch(i);
              setSelected(null);
            }}
          >
            {br.name}
            <small className="num">{String(branchRanks(br.id))}</small>
          </button>
        ))}
      </div>

      <div className="meta-tree" aria-label={t('meta.branch', { name: b.name })}>
        {Array.from({ length: TIERS }, (_, tier) => (
          <div key={tier} className="meta-tier">
            {tier > 0 && (
              <div className="meta-links" aria-hidden="true">
                {[0, 1].map((c) => {
                  const n = at(tier, c);
                  return <i key={c} className={n && talentOpen(data, n) ? 'on' : ''} />;
                })}
              </div>
            )}
            <div className="meta-row">
              {[0, 1].map((c) => {
                const n = at(tier, c);
                return n ? (
                  <Node
                    key={n.id}
                    data={data}
                    node={n}
                    selected={n.id === selected}
                    onSelect={() => {
                      sfx('ui.card');
                      setSelected(n.id);
                    }}
                  />
                ) : (
                  <span key={c} />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {sel && detail(sel)}

      <section className="meta-panel meta-reset">
        <p className="num">
          {t('meta.invested')} <b>{fmt(spent)}&nbsp;◆</b>
        </p>
        <button
          className={armed ? 'btn-ghost danger' : 'btn-ghost'}
          id="talent-reset"
          disabled={spent === 0}
          onClick={() => {
            if (!armed) {
              sfx('ui.click');
              setArmed(true);
              return;
            }
            sfx('ui.back');
            setArmed(false);
            mutate((d) => {
              resetTalents(d);
            });
          }}
          onBlur={() => {
            setArmed(false);
          }}
        >
          {armed ? t('meta.resetConfirm', { n: fmt(spent) }) : t('meta.resetTree')}
        </button>
      </section>
    </>
  );
}
