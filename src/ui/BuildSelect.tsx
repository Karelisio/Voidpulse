/** Build du Boss Rush : armes et passifs de départ (niveaux fixés par config/modes.json). */
import { useState } from 'react';
import { audio } from '../audio';
import { uiSound } from '../audio/bridge';
import { CHARACTERS, MODES, PASSIVES, WEAPONS } from '../content/data';
import { useSave } from '../state/save';
import { ELEMENT_LABEL } from './cards';
import { iconUrl } from './portraits';

function toggle(list: string[], id: string, max: number): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return list.length < max ? [...list, id] : list;
}

export function BuildSelect({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  const data = useSave((s) => s.data);
  const update = useSave((s) => s.update);
  const cfg = MODES.bossRush;
  const character = CHARACTERS.find((c) => c.id === data.profile.character) ?? CHARACTERS[0];
  const [weapons, setWeapons] = useState<string[]>(() => {
    const saved = data.profile.loadout.weapons.filter((id) => WEAPONS.some((w) => w.id === id));
    return saved.length > 0 ? saved.slice(0, cfg.weapons) : [character.weapon];
  });
  const [passives, setPassives] = useState<string[]>(() =>
    data.profile.loadout.passives
      .filter((id) => PASSIVES.some((p) => p.id === id))
      .slice(0, cfg.passives),
  );

  return (
    <main className="select build">
      <h2>Build</h2>
      <p className="muted">
        Armes niveau {cfg.weaponLevel} ({weapons.length}/{cfg.weapons}), passifs niveau{' '}
        {cfg.passiveLevel} ({passives.length}/{cfg.passives}). La première arme ouvre le feu.
      </p>
      <section className="build-grid" aria-label="Armes">
        {WEAPONS.map((w) => {
          const on = weapons.includes(w.id);
          return (
            <button
              key={w.id}
              id={`build-${w.id}`}
              className={`build-cell ${on ? 'on' : ''}`}
              aria-pressed={on}
              title={w.description}
              onClick={() => {
                uiSound(audio(), 'ui.click');
                setWeapons((l) => toggle(l, w.id, cfg.weapons));
              }}
            >
              <img src={iconUrl(w.id)} alt="" width={36} height={36} />
              <span>{w.name}</span>
              <small className={`card-element el-${w.element}`}>{ELEMENT_LABEL[w.element]}</small>
              {on && <i>{weapons.indexOf(w.id) + 1}</i>}
            </button>
          );
        })}
      </section>
      <section className="build-grid" aria-label="Passifs">
        {PASSIVES.map((p) => {
          const on = passives.includes(p.id);
          return (
            <button
              key={p.id}
              id={`build-${p.id}`}
              className={`build-cell ${on ? 'on' : ''}`}
              aria-pressed={on}
              title={p.description}
              onClick={() => {
                uiSound(audio(), 'ui.click');
                setPassives((l) => toggle(l, p.id, cfg.passives));
              }}
            >
              <img src={iconUrl(p.id)} alt="" width={36} height={36} />
              <span>{p.name}</span>
            </button>
          );
        })}
      </section>
      <div className="end-actions">
        <button
          className="btn-primary"
          id="start-build"
          disabled={weapons.length === 0}
          onClick={() => {
            uiSound(audio(), 'ui.confirm');
            update((d) => {
              d.profile.loadout = { weapons, passives };
            });
            onStart();
          }}
        >
          Affronter les boss
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            uiSound(audio(), 'ui.back');
            onBack();
          }}
        >
          Retour
        </button>
      </div>
    </main>
  );
}
