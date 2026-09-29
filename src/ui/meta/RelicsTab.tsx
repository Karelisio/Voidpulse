/** Reliques : emplacements, inventaire, amélioration, relance, recyclage et forge. */
import { useEffect, useState } from 'react';
import { BOSSES, META } from '../../content/data';
import { Rng } from '../../engine/rng';
import { t, useLang } from '../../i18n';
import { forgeOpen, relicSlots } from '../../meta/account';
import {
  buyCache,
  equipRelic,
  rarityOf,
  relicBase,
  relicStats,
  rerollCost,
  rerollRelic,
  salvageRelic,
  salvageValue,
  upgradeCost,
  upgradeRelic,
} from '../../meta/relics';
import { formatStat } from '../../meta/stats';
import type { RelicItem } from '../../save/schema';
import { useSave } from '../../state/save';
import { fmt, mutate, sfx, tone } from './common';
import { RelicBadge } from './RelicBadge';

const R = META.relics;

const relicName = (item: RelicItem): string => relicBase(item.base)?.name ?? item.base;

/** Niveau de compte qui ouvre l'emplacement `slot` (0-indexé), ou null. */
function slotLevel(slot: number): number | null {
  const ups = META.account.unlocks.filter((u) => u.unlock === 'relicSlot');
  return slot === 0 ? null : ((ups[slot - 1] as (typeof ups)[number] | undefined)?.level ?? null);
}

const bossName = (id: string): string => BOSSES.find((b) => b.id === id)?.name ?? id;

export function RelicsTab() {
  useLang();
  const data = useSave((s) => s.data);
  const [selected, setSelected] = useState(0);
  const [fresh, setFresh] = useState(0);
  const [armed, setArmed] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (fresh === 0) return;
    document.getElementById(`relic-${String(fresh)}`)?.scrollIntoView({ block: 'center' });
    const timer = window.setTimeout(() => {
      setFresh(0);
    }, 2600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fresh]);

  const { items, equipped } = data.meta.relics;
  const slots = relicSlots(data);
  const sorted = [...items].sort(
    (a, b) => b.rarity - a.rarity || b.level - a.level || a.uid - b.uid,
  );
  const sel = items.find((r) => r.uid === selected);
  const slotOf = (uid: number): number => equipped.slice(0, slots).indexOf(uid);
  const forge = forgeOpen(data);
  const full = items.length >= R.inventory;
  const forgeLevel = META.account.unlocks.find((u) => u.unlock === 'forge')?.level ?? 0;

  const pick = (uid: number): void => {
    sfx('ui.card');
    setSelected(uid);
    setArmed(0);
    setNote('');
  };

  const detail = (item: RelicItem) => {
    const rarity = rarityOf(item);
    const stats = Object.entries(relicStats(item));
    const up = upgradeCost(item);
    const reroll = rerollCost(item);
    const slot = slotOf(item.uid);
    const base = relicBase(item.base);
    return (
      <section className="meta-sheet" style={tone(rarity.color)} aria-label={relicName(item)}>
        <div className="meta-sheet-head">
          <RelicBadge item={item} size={52} />
          <div>
            <h3>{relicName(item)}</h3>
            <small className="num">
              <b style={{ color: rarity.color }}>{rarity.name}</b> ·{' '}
              {t('meta.relicLevel', { n: item.level, max: R.maxLevel })}
              {slot >= 0 ? ` · ${t('meta.relicSlotN', { n: slot + 1 })}` : ''}
            </small>
          </div>
        </div>
        <ul className="meta-list meta-stats">
          {stats.map(([k, v], i) => (
            <li key={k} className={i === 0 ? 'sig' : ''}>
              {formatStat(k, v)}
              {i === 0 && <small className="muted"> · {t('meta.signature')}</small>}
            </li>
          ))}
        </ul>
        {base?.boss && (
          <small className="muted">{t('meta.bossLoot', { boss: bossName(base.boss) })}</small>
        )}
        <div className="meta-equip">
          {Array.from({ length: slots }, (_, i) => (
            <button
              key={i}
              id={`relic-equip-${String(i + 1)}`}
              className={`btn-ghost ${slot === i ? 'on' : ''}`}
              disabled={slot === i}
              onClick={() => {
                sfx('ui.confirm');
                mutate((d) => {
                  equipRelic(d, item.uid, i);
                });
              }}
            >
              {t('meta.equip', { n: i + 1 })}
            </button>
          ))}
          {slot >= 0 && (
            <button
              id="relic-unequip"
              className="btn-ghost"
              onClick={() => {
                sfx('ui.back');
                mutate((d) => {
                  equipRelic(d, 0, slot);
                });
              }}
            >
              {t('meta.unequip')}
            </button>
          )}
        </div>
        <div className="meta-actions">
          <button
            className="btn-ghost"
            id="relic-upgrade"
            disabled={up === null || data.wallet.fragments < up}
            onClick={() => {
              sfx('ui.confirm');
              mutate((d) => {
                upgradeRelic(d, item.uid);
              });
              setNote(t('meta.upgraded'));
            }}
          >
            {up === null ? t('meta.levelMax') : t('meta.upgrade', { n: fmt(up) })}
          </button>
          <button
            className="btn-ghost"
            id="relic-reroll"
            disabled={item.stats.length === 0 || data.wallet.fragments < reroll}
            onClick={() => {
              sfx('ui.confirm');
              mutate((d) => {
                rerollRelic(d, item.uid, new Rng(`reroll:${String(Date.now())}`));
              });
              setNote(t('meta.rerolled'));
            }}
          >
            {t('meta.reroll', { n: fmt(reroll) })}
          </button>
          <button
            className={armed === item.uid ? 'btn-ghost danger' : 'btn-ghost'}
            id="relic-salvage"
            onClick={() => {
              if (armed !== item.uid) {
                sfx('ui.click');
                setArmed(item.uid);
                return;
              }
              sfx('ui.back');
              mutate((d) => {
                salvageRelic(d, item.uid);
              });
              setSelected(0);
              setArmed(0);
            }}
          >
            {armed === item.uid
              ? t('meta.salvageConfirm', { n: fmt(salvageValue(item)) })
              : t('meta.salvage', { n: fmt(salvageValue(item)) })}
          </button>
        </div>
        {note && (
          <small className="muted" role="status">
            {note}
          </small>
        )}
      </section>
    );
  };

  return (
    <>
      <section className="meta-slots" aria-label={t('meta.slots')}>
        {Array.from({ length: R.slots }, (_, i) => {
          const item = i < slots ? items.find((r) => r.uid === equipped[i]) : undefined;
          const level = slotLevel(i);
          const open = i < slots;
          return (
            <button
              key={i}
              id={`relic-slot-${String(i + 1)}`}
              className={`meta-slot ${open ? '' : 'locked'} ${item?.uid === selected ? 'sel' : ''}`}
              style={item ? tone(rarityOf(item).color) : undefined}
              disabled={!item}
              onClick={() => {
                if (item) pick(item.uid);
              }}
            >
              <small className="muted">{t('meta.slotN', { n: i + 1 })}</small>
              {item ? (
                <>
                  <RelicBadge item={item} size={40} />
                  <span className="meta-slot-name">{relicName(item)}</span>
                </>
              ) : (
                <span className="meta-slot-empty">
                  {open ? t('meta.slotEmpty') : t('core.level', { n: level ?? '?' })}
                </span>
              )}
            </button>
          );
        })}
      </section>

      <section className="meta-panel meta-forge" aria-label={t('meta.forge')}>
        <div>
          <h3>{t('meta.forge')}</h3>
          <small className="muted num">
            {t('meta.inventory', { n: items.length, max: R.inventory })}
          </small>
        </div>
        {forge ? (
          <button
            className="btn-primary"
            id="forge-buy"
            disabled={full || data.wallet.fragments < R.cacheCost}
            onClick={() => {
              sfx('ui.confirm');
              const out: { item: RelicItem | null } = { item: null };
              mutate((d) => {
                out.item = buyCache(d, new Rng(`forge:${String(Date.now())}`));
              });
              if (out.item) {
                setFresh(out.item.uid);
                setSelected(out.item.uid);
                setArmed(0);
                setNote(t('meta.newRelic'));
              }
            }}
          >
            {full ? t('meta.inventoryFull') : t('meta.buyCache', { n: fmt(R.cacheCost) })}
          </button>
        ) : (
          <p className="muted meta-forge-locked">{t('meta.forgeLocked', { n: forgeLevel })}</p>
        )}
      </section>

      {sorted.length > 0 ? (
        <section className="meta-relics" aria-label={t('meta.inventoryAria')}>
          {sorted.map((item) => {
            const rarity = rarityOf(item);
            const slot = slotOf(item.uid);
            return (
              <button
                key={item.uid}
                id={`relic-${String(item.uid)}`}
                className={`meta-relic ${item.uid === selected ? 'sel' : ''} ${item.uid === fresh ? 'fresh' : ''}`}
                style={tone(rarity.color)}
                aria-pressed={item.uid === selected}
                onClick={() => {
                  pick(item.uid);
                }}
              >
                <RelicBadge item={item} size={44} />
                <span className="meta-relic-name">{relicName(item)}</span>
                <small style={{ color: rarity.color }}>{rarity.name}</small>
                <small className="muted num">{t('meta.levelShort', { n: item.level })}</small>
                {slot >= 0 && <i>{t('meta.equippedTag', { n: slot + 1 })}</i>}
              </button>
            );
          })}
        </section>
      ) : (
        <p className="muted meta-empty">
          {t(forge ? 'meta.relicsEmptyForge' : 'meta.relicsEmpty', {
            chance: Math.round(R.bossDropChance * 100),
          })}
        </p>
      )}

      {sel && detail(sel)}
    </>
  );
}
