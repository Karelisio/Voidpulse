/**
 * Sélecteur intégré au jeu (atelier d'entraînement, menu debug) : un bouton qui ouvre une
 * grille d'éléments (icône ou pastille de couleur, nom), groupés par section. Remplace les
 * listes déroulantes natives, rendues par Android comme une boîte de dialogue système.
 */
import { useState } from 'react';
import { uiSound } from '../audio/bridge';
import { audio } from '../audio';
import { t, useLang } from '../i18n';
import { useBackHandler } from '../platform/back';

export interface PickerItem {
  value: number;
  name: string;
  /** Icône (URL de données) ou, à défaut, pastille de cette couleur. */
  icon?: string;
  color?: string;
  /** Section (secteur, catégorie) ; les éléments d'une même section se suivent. */
  group?: string;
}

export function Picker({
  label,
  value,
  items,
  onChange,
  id,
}: {
  label: string;
  value: number;
  items: readonly PickerItem[];
  onChange: (value: number) => void;
  id?: string;
}) {
  useLang();
  const [open, setOpen] = useState(false);
  useBackHandler(() => {
    setOpen(false);
    return true;
  }, open);
  const current = items.find((i) => i.value === value) ?? items[0];
  const groups: { name: string; items: PickerItem[] }[] = [];
  for (const item of items) {
    const name = item.group ?? '';
    const last = groups.at(-1);
    if (last?.name === name) last.items.push(item);
    else groups.push({ name, items: [item] });
  }

  return (
    <>
      <button
        className="picker-btn"
        id={id}
        aria-label={`${label} : ${current.name}`}
        aria-haspopup="dialog"
        onClick={() => {
          uiSound(audio(), 'ui.click');
          setOpen(true);
        }}
      >
        <Mark item={current} />
        <span className="picker-name">{current.name}</span>
        <span className="picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          className="picker-backdrop"
          onClick={() => {
            setOpen(false);
          }}
        >
          <div
            className="picker-sheet"
            role="dialog"
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <header>
              <h3>{label}</h3>
              <button
                className="picker-close"
                aria-label={t('core.close')}
                onClick={() => {
                  uiSound(audio(), 'ui.back');
                  setOpen(false);
                }}
              >
                ✕
              </button>
            </header>
            <div className="picker-list">
              {groups.map((g) => (
                <section key={g.name || '_'}>
                  {g.name && <h4>{g.name}</h4>}
                  <div className="picker-grid">
                    {g.items.map((item) => (
                      <button
                        key={item.value}
                        className={item.value === value ? 'on' : ''}
                        aria-pressed={item.value === value}
                        onClick={() => {
                          uiSound(audio(), 'ui.confirm');
                          onChange(item.value);
                          setOpen(false);
                        }}
                      >
                        <Mark item={item} />
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Mark({ item }: { item: PickerItem }) {
  if (item.icon) return <img className="picker-icon" src={item.icon} alt="" />;
  return (
    <span
      className="picker-dot"
      aria-hidden="true"
      style={{ background: item.color ?? 'currentColor', color: item.color }}
    />
  );
}
