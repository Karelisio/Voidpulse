/** Codex : ennemis, armes, évolutions, réactions et boss découverts, avec paliers de récompense. */
import { useState } from 'react';
import { META } from '../../content/data';
import { codexEntries, codexProgress, type CodexCategory } from '../../meta/codex';
import { useSave } from '../../state/save';
import { ELEMENT_LABEL } from '../cards';
import { fmt, pct, sfx, tone } from './common';
import { codexInfo } from './codexInfo';

const C = META.codex;
const CATEGORIES = C.categories as { id: CodexCategory; name: string }[];

function Elements({ list }: { list: string[] }) {
  return (
    <>
      {list.map((el) => (
        <small key={el} className={`card-element el-${el}`}>
          {ELEMENT_LABEL[el]}
        </small>
      ))}
    </>
  );
}

export function CodexTab() {
  const data = useSave((s) => s.data);
  const [catIndex, setCatIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const cat = CATEGORIES[catIndex];
  const ids = codexEntries(cat.id);
  const known = new Set(data.meta.codex[cat.id]);
  const ratio = codexProgress(data, cat.id);
  const claimed = data.meta.codex.claimed[cat.id] ?? 0;
  const nextTier = claimed < C.thresholds.length ? claimed : -1;
  const info = selected !== null && known.has(selected) ? codexInfo(cat.id, selected) : null;

  return (
    <>
      <div className="meta-subtabs codex" role="tablist" aria-label="Catégories">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.id}
            id={`codex-${c.id}`}
            role="tab"
            aria-selected={i === catIndex}
            className={i === catIndex ? 'on' : ''}
            onClick={() => {
              sfx('ui.click');
              setCatIndex(i);
              setSelected(null);
            }}
          >
            {c.name}
            <small className="num">{pct(codexProgress(data, c.id))}</small>
          </button>
        ))}
      </div>

      <section className="meta-panel" aria-label="Complétion">
        <div className="meta-codex-head">
          <b className="num">
            {String(known.size)} / {String(ids.length)}
          </b>
          <span className="muted num">{pct(ratio)}</span>
        </div>
        <div className="meta-bar" aria-hidden="true">
          <i style={{ width: `${String(ratio * 100)}%` }} />
          {C.thresholds.slice(0, -1).map((t) => (
            <u key={t} style={{ left: `${String(t * 100)}%` }} />
          ))}
        </div>
        <small className="muted">
          {nextTier >= 0
            ? `Prochain palier ${pct(C.thresholds[nextTier])} : +${fmt(C.fragments[nextTier])}\u00a0◆`
            : 'Tous les paliers sont atteints.'}
        </small>
      </section>

      <section className="meta-grid codex" aria-label={cat.name}>
        {ids.map((id) => {
          const seen = known.has(id);
          const e = seen ? codexInfo(cat.id, id) : null;
          const glyph = e && !e.img;
          return (
            <button
              key={id}
              id={`entry-${id}`}
              className={`meta-cell ${seen ? '' : 'unknown'} ${id === selected ? 'sel' : ''}`}
              style={tone(e?.color ?? '#a298c6')}
              disabled={!seen}
              aria-pressed={id === selected}
              onClick={() => {
                sfx('ui.card');
                setSelected(id);
              }}
            >
              {glyph ? (
                <span className="meta-glyph" aria-hidden="true">
                  ✦
                </span>
              ) : (
                <CellImage cat={cat.id} id={id} seen={seen} />
              )}
              <span className="meta-cell-name">{e?.name ?? '???'}</span>
            </button>
          );
        })}
      </section>

      {info && (
        <section className="meta-sheet" style={tone(info.color)} aria-label={info.name}>
          <div className="meta-sheet-head">
            {info.img ? (
              <img src={info.img} alt="" width={56} height={56} />
            ) : (
              <span className="meta-glyph big" aria-hidden="true">
                ✦
              </span>
            )}
            <div>
              <h3>{info.name}</h3>
              <div className="meta-elements">
                <Elements list={info.elements} />
              </div>
            </div>
          </div>
          {info.description && <p>{info.description}</p>}
          {info.facts.length > 0 && (
            <dl className="meta-facts">
              {info.facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
    </>
  );
}

function CellImage({ cat, id, seen }: { cat: CodexCategory; id: string; seen: boolean }) {
  const e = codexInfo(cat, id);
  if (!e?.img)
    return (
      <span className="meta-glyph" aria-hidden="true">
        ?
      </span>
    );
  return <img src={e.img} alt="" width={40} height={40} className={seen ? '' : 'sil'} />;
}
