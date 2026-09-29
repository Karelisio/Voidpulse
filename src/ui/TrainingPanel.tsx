/**
 * Atelier du mode Entraînement : armes, passifs, ennemis, élites et boss à la demande, et
 * mesure des dégâts par seconde (fenêtre glissante de 5 s) par arme, réactions et Éveil.
 */
import { useEffect, useRef, useState } from 'react';
import { BOSSES, ENEMIES, PASSIVES, WEAPONS } from '../content/data';
import type { GameHost } from '../game/host';
import { SLOT_EVEIL, SLOT_REACTION } from '../systems/events';

const WINDOW = 5;

interface DpsLine {
  name: string;
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
        dps: rate(w.slot),
      }));
      out.push({ name: 'Réactions', dps: rate(SLOT_REACTION) });
      out.push({ name: 'Éveil', dps: rate(SLOT_EVEIL) });
      setLines(out);
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [host]);
  return lines;
}

export function TrainingPanel({ host }: { host: GameHost }) {
  const [open, setOpen] = useState(true);
  const [weapon, setWeapon] = useState(0);
  const [passive, setPassive] = useState(0);
  const [enemy, setEnemy] = useState(0);
  const [boss, setBoss] = useState(0);
  const [, refresh] = useState(0);
  const dps = useDps(host);
  const sim = host.sim;
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
        ATELIER
      </button>
      {open && (
        <div className="debug-body">
          <div className="debug-row">
            <select
              aria-label="Arme"
              value={weapon}
              onChange={(e) => {
                setWeapon(Number(e.target.value));
              }}
            >
              {WEAPONS.map((w, i) => (
                <option key={w.id} value={i}>
                  {w.name}
                </option>
              ))}
            </select>
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
              Évoluer
            </button>
            <button
              onClick={act(() => {
                sim.debugRemoveWeapon(weapon);
              })}
            >
              Retirer
            </button>
          </div>
          <div className="debug-row">
            <select
              aria-label="Passif"
              value={passive}
              onChange={(e) => {
                setPassive(Number(e.target.value));
              }}
            >
              {PASSIVES.map((p, i) => (
                <option key={p.id} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={act(() => {
                sim.debugPassive(passive);
              })}
            >
              +1
            </button>
          </div>
          <div className="debug-row">
            <select
              aria-label="Ennemi"
              value={enemy}
              onChange={(e) => {
                setEnemy(Number(e.target.value));
              }}
            >
              {ENEMIES.map((x, i) => (
                <option key={x.id} value={i}>
                  {x.name}
                </option>
              ))}
            </select>
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
              Élite
            </button>
          </div>
          <div className="debug-row">
            <select
              aria-label="Boss"
              value={boss}
              onChange={(e) => {
                setBoss(Number(e.target.value));
              }}
            >
              {BOSSES.map((b, i) => (
                <option key={b.id} value={i}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              onClick={act(() => {
                sim.debugBoss(boss);
              })}
            >
              Boss
            </button>
            <button
              id="tr-clear"
              onClick={act(() => {
                sim.debugClear();
              })}
            >
              Nettoyer
            </button>
          </div>
          <div className="debug-row">
            <button
              onClick={act(() => {
                sim.debugLevelUp();
              })}
            >
              Niveau +1
            </button>
            <button
              onClick={act(() => {
                sim.debugEveil();
              })}
            >
              Éveil
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
              Invincible
            </label>
          </div>
          <table className="dps" aria-label="Dégâts par seconde">
            <tbody>
              {dps.map((l) => (
                <tr key={l.name}>
                  <td>{l.name}</td>
                  <td>{Math.round(l.dps).toLocaleString('fr-FR')}</td>
                </tr>
              ))}
              <tr>
                <th>DPS ({WINDOW} s)</th>
                <th>{Math.round(total).toLocaleString('fr-FR')}</th>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
