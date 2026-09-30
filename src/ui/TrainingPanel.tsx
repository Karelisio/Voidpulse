/**
 * Atelier du mode Entraînement : armes, passifs, ennemis, élites et boss à la demande, et
 * mesure des dégâts par seconde (fenêtre glissante de 5 s) par arme, réactions et Éveil.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameHost } from '../game/host';
import { num, t, useLang, type TKey } from '../i18n';
import { SLOT_EVEIL, SLOT_REACTION } from '../systems/events';
import { Picker } from './Picker';
import { bossItems, enemyItems, passiveItems, weaponItems } from './pickerItems';

const WINDOW = 5;

interface DpsLine {
  name: string;
  /** Clé de traduction des lignes fixes (réactions, Éveil), sinon null (nom d'arme). */
  label: TKey | null;
  dps: number;
}

/** Relevé chaque seconde des dégâts cumulés par emplacement ; DPS = écart sur la fenêtre. */
function useDps(host: GameHost): DpsLine[] {
  const samples = useRef<Float64Array[]>([]);
  const [lines, setLines] = useState<DpsLine[]>([]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const st = host.sim.state;
      if (st.status !== 'running') return;
      const s = samples.current;
      s.push(Float64Array.from(st.stats.damageBySlot));
      if (s.length > WINDOW + 1) s.shift();
      if (s.length < 2) return;
      const a = s[0];
      const b = s[s.length - 1];
      const span = s.length - 1;
      const rate = (slot: number): number => (b[slot] - a[slot]) / span;
      const out: DpsLine[] = st.weapons.map((w) => ({
        name: w.evolved ? w.def.evolution.name : w.def.name,
        label: null,
        dps: rate(w.slot),
      }));
      out.push({ name: '', label: 'training.reactions', dps: rate(SLOT_REACTION) });
      out.push({ name: '', label: 'training.awakening', dps: rate(SLOT_EVEIL) });
      setLines(out);
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [host]);
  return lines;
}

export function TrainingPanel({ host }: { host: GameHost }) {
  useLang();
  const [open, setOpen] = useState(true);
  const [weapon, setWeapon] = useState(0);
  const [passive, setPassive] = useState(0);
  const [enemy, setEnemy] = useState(0);
  const [boss, setBoss] = useState(0);
  const [, refresh] = useState(0);
  const dps = useDps(host);
  const sim = host.sim;
  const urls = host.renderer.atlas.iconUrls;
  const total = dps.reduce((s, l) => s + l.dps, 0);
  const act = (fn: () => void) => () => {
    fn();
    refresh((n) => n + 1);
  };

  return (
    <div className={`debug training ${open ? 'open' : ''}`}>
      <button
        className="debug-toggle"
        id="training-toggle"
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {t('training.toggle')}
      </button>
      {open && (
        <div className="debug-body">
          <div className="debug-row">
            <Picker
              label={t('training.weapon')}
              value={weapon}
              items={weaponItems(urls)}
              onChange={setWeapon}
            />
            <button
              id="tr-weapon"
              onClick={act(() => {
                sim.debugWeapon(weapon);
              })}
            >
              +1
            </button>
            <button
              onClick={act(() => {
                sim.debugEvolve(weapon);
              })}
            >
              {t('training.evolve')}
            </button>
            <button
              onClick={act(() => {
                sim.debugRemoveWeapon(weapon);
              })}
            >
              {t('training.remove')}
            </button>
          </div>
          <div className="debug-row">
            <Picker
              label={t('training.passive')}
              value={passive}
              items={passiveItems(urls)}
              onChange={setPassive}
            />
            <button
              onClick={act(() => {
                sim.debugPassive(passive);
              })}
            >
              +1
            </button>
          </div>
          <div className="debug-row">
            <Picker
              label={t('training.enemy')}
              value={enemy}
              items={enemyItems()}
              onChange={setEnemy}
            />
            {[1, 10, 50].map((n) => (
              <button
                key={n}
                id={n === 10 ? 'tr-spawn' : undefined}
                onClick={act(() => {
                  sim.debugSpawn(enemy, n);
                })}
              >
                ×{n}
              </button>
            ))}
            <button
              onClick={act(() => {
                sim.debugElite(enemy);
              })}
            >
              {t('training.elite')}
            </button>
          </div>
          <div className="debug-row">
            <Picker
              label={t('training.boss')}
              value={boss}
              items={bossItems()}
              onChange={setBoss}
            />
            <button
              onClick={act(() => {
                sim.debugBoss(boss);
              })}
            >
              {t('training.boss')}
            </button>
            <button
              id="tr-clear"
              onClick={act(() => {
                sim.debugClear();
              })}
            >
              {t('training.clear')}
            </button>
          </div>
          <div className="debug-row">
            <button
              onClick={act(() => {
                sim.debugLevelUp();
              })}
            >
              {t('training.levelUp')}
            </button>
            <button
              onClick={act(() => {
                sim.debugEveil();
              })}
            >
              {t('training.awakening')}
            </button>
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => {
                  host.setTimeScale(s);
                }}
              >
                ×{s}
              </button>
            ))}
            <label>
              <input
                type="checkbox"
                defaultChecked={sim.state.debug.invincible}
                onChange={(e) => {
                  host.setInvincible(e.target.checked);
                }}
              />
              {t('training.invincible')}
            </label>
          </div>
          <table className="dps" aria-label={t('training.dpsAria')}>
            <tbody>
              {dps.map((l) => (
                <tr key={l.label ?? l.name}>
                  <td>{l.label ? t(l.label) : l.name}</td>
                  <td>{num(Math.round(l.dps))}</td>
                </tr>
              ))}
              <tr>
                <th>{t('training.dpsTotal', { n: WINDOW })}</th>
                <th>{num(Math.round(total))}</th>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
