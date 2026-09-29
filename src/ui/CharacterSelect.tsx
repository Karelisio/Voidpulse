/** Choix du personnage : grille des 12 vaisseaux, fiche détaillée, déblocages. */
import { useState } from 'react';
import { audio } from '../audio';
import { uiSound } from '../audio/bridge';
import { CHARACTERS, WEAPONS } from '../content/data';
import { t, useLang } from '../i18n';
import { isUnlocked } from '../meta/unlocks';
import { useSave } from '../state/save';
import { ELEMENT_LABEL } from './cards';
import { iconUrl, shipPortrait } from './portraits';

export function CharacterSelect({
  onStart,
  onBack,
  forceUnlocked,
}: {
  onStart: () => void;
  onBack: () => void;
  /** Menu debug : tous les personnages jouables. */
  forceUnlocked: boolean;
}) {
  useLang();
  const data = useSave((s) => s.data);
  const update = useSave((s) => s.update);
  const [selected, setSelected] = useState(() => {
    const i = CHARACTERS.findIndex((c) => c.id === data.profile.character);
    return i < 0 ? 0 : i;
  });
  const c = CHARACTERS[selected];
  const open = (i: number): boolean => forceUnlocked || isUnlocked(data, CHARACTERS[i]);
  const weapon = WEAPONS.find((w) => w.id === c.weapon);

  return (
    <main className="select">
      <h2>{t('select.pilotTitle')}</h2>
      <div className="roster" role="listbox" aria-label={t('select.rosterAria')}>
        {CHARACTERS.map((ch, i) => (
          <button
            key={ch.id}
            id={`char-${ch.id}`}
            role="option"
            aria-selected={i === selected}
            className={`roster-cell ${i === selected ? 'on' : ''} ${open(i) ? '' : 'locked'}`}
            style={{ '--char': ch.color } as React.CSSProperties}
            onClick={() => {
              uiSound(audio(), 'ui.click');
              setSelected(i);
            }}
          >
            <img src={shipPortrait(ch.id)} alt="" width={56} height={56} />
            <span>{ch.name}</span>
          </button>
        ))}
      </div>
      <section className="char-sheet" style={{ '--char': c.color } as React.CSSProperties}>
        <img className="char-portrait" src={shipPortrait(c.id)} alt="" width={96} height={96} />
        <div className="char-text">
          <h3>
            {c.name} <small>{c.title}</small>
          </h3>
          <p className="muted">{c.description}</p>
          <dl>
            <div>
              <dt>{t('select.weapon')}</dt>
              <dd>
                {weapon && <img src={iconUrl(weapon.id)} alt="" width={22} height={22} />}
                {weapon?.name ?? c.weapon}{' '}
                <span className={`card-element el-${c.element}`}>{ELEMENT_LABEL[c.element]}</span>
              </dd>
            </div>
            <div>
              <dt>{c.passive.name}</dt>
              <dd>{c.passive.description}</dd>
            </div>
            <div>
              <dt>{t('select.dashOf', { name: c.dash.name })}</dt>
              <dd>{c.dash.description}</dd>
            </div>
          </dl>
        </div>
      </section>
      <div className="end-actions">
        <button
          className="btn-primary"
          id="start-run"
          disabled={!open(selected)}
          onClick={() => {
            uiSound(audio(), 'ui.confirm');
            update((d) => {
              d.profile.character = c.id;
            });
            onStart();
          }}
        >
          {open(selected) ? t('select.takeOff') : t('select.lockedHint', { hint: c.unlock.hint })}
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            uiSound(audio(), 'ui.back');
            onBack();
          }}
        >
          {t('core.back')}
        </button>
      </div>
    </main>
  );
}
