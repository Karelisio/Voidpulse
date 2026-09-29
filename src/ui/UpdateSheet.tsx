/**
 * Feuille du bas « Mise à jour disponible » : version, notes de version (Markdown simple),
 * taille, puis téléchargement avec progression et installation. Montrée sur l'écran titre.
 */
import { Fragment, type ReactNode } from 'react';
import { language, locale, num, t, useLang } from '../i18n';
import { useBackHandler } from '../platform/back';
import {
  closeSheet,
  checkForUpdates,
  download,
  ignoreVersion,
  install,
  useUpdate,
} from '../update/updater';
import { VoidpulseNative } from '../platform/native';

function formatBytes(n: number): string {
  const [b, kb, mb] = language() === 'fr' ? ['o', 'Ko', 'Mo'] : ['B', 'KB', 'MB'];
  if (n < 1024) return `${num(n)} ${b}`;
  if (n < 1024 * 1024) return `${num(n / 1024, 0)} ${kb}`;
  return `${num(n / (1024 * 1024), 1)} ${mb}`;
}

/** Gras, italique et code en ligne ; tout le reste est du texte (jamais de HTML). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const s = m[0];
    if (s.startsWith('**')) out.push(<b key={k++}>{s.slice(2, -2)}</b>);
    else if (s.startsWith('`')) out.push(<code key={k++}>{s.slice(1, -1)}</code>);
    else out.push(<i key={k++}>{s.slice(1, -1)}</i>);
    last = m.index + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Markdown des notes de version GitHub : titres, listes, paragraphes ; liens réduits au texte. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>);
      para = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={blocks.length}>
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  const clean = (s: string) =>
    s
      .replace(/<!--.*?-->/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\s*\(\s*\b[0-9a-f]{7,40}\b\s*\)/g, '')
      .trim();
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = clean(raw);
    if (!line) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^[-*+]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push(<h4 key={blocks.length}>{inline(h[2])}</h4>);
    } else if (li) {
      if (para.length) flush();
      list.push(li[1]);
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return <Fragment>{blocks}</Fragment>;
}

export function UpdateSheet() {
  useLang();
  const s = useUpdate();
  useBackHandler(() => {
    closeSheet();
    return true;
  }, s.open);
  if (!s.open) return null;
  const info = s.info;
  const pct = s.total > 0 ? Math.min(1, s.received / s.total) : -1;
  const date = info?.publishedAt
    ? new Date(info.publishedAt).toLocaleDateString(locale(), { dateStyle: 'long' })
    : '';

  let body: ReactNode = null;
  let actions: ReactNode = null;
  switch (s.status) {
    case 'checking':
      body = <p className="set-note">{t('update.checking')}</p>;
      break;
    case 'none':
      body = <p className="set-note">{t('update.upToDate', { version: s.installed })}</p>;
      break;
    case 'error':
      body = (
        <p className="set-warn" role="alert">
          {t('update.error', { error: s.error ?? '?' })}
        </p>
      );
      actions = (
        <button
          className="btn-primary"
          onClick={() => {
            if (info) void download();
            else void checkForUpdates(true);
          }}
        >
          {t('update.retry')}
        </button>
      );
      break;
    case 'downloading':
      body = (
        <div className="upd-progress">
          <progress value={pct >= 0 ? pct : undefined} max={1} />
          <span>
            {pct >= 1
              ? t('update.verifying')
              : pct >= 0
                ? t('update.downloading', { pct: `${String(Math.floor(pct * 100))} %` })
                : t('update.downloadingUnknown', { received: formatBytes(s.received) })}
          </span>
        </div>
      );
      break;
    case 'ready':
      body = <p className="set-note">{t('update.ready')}</p>;
      actions = (
        <button className="btn-primary" onClick={() => void install()}>
          {t('update.install')}
        </button>
      );
      break;
    case 'permission':
      body = <p className="set-note">{t('update.permission')}</p>;
      actions = (
        <>
          <button className="btn-primary" onClick={() => void install()}>
            {t('update.install')}
          </button>
          <button
            className="btn-ghost"
            onClick={() => void VoidpulseNative.openInstallSettings()}
          >
            {t('update.openSettings')}
          </button>
        </>
      );
      break;
    case 'available':
      actions = (
        <>
          <button className="btn-primary" id="update-now" onClick={() => void download()}>
            {t('update.update')}
          </button>
          <button className="btn-ghost" onClick={closeSheet}>
            {t('update.later')}
          </button>
          <button className="btn-ghost" onClick={ignoreVersion}>
            {t('update.ignore')}
          </button>
        </>
      );
      break;
    case 'idle':
      break;
  }

  return (
    <div className="overlay update-sheet" role="dialog" aria-label={t('update.sheetAria')}>
      <div className="set-panel">
        <header className="set-head">
          <h2>
            {info ? t('update.available', { version: info.version }) : t('update.check')}
            {info?.prerelease && <span className="upd-badge">{t('update.prerelease')}</span>}
          </h2>
          <button className="btn-ghost" onClick={closeSheet}>
            {t('update.close')}
          </button>
        </header>
        {info && (
          <>
            <p className="upd-meta">
              {t('update.installed', { version: s.installed })} ·{' '}
              {t('update.size', { size: formatBytes(info.size) })}
              {date && ` · ${t('update.published', { date })}`}
            </p>
            <section className="upd-notes" aria-label={t('update.changelog')}>
              {info.notes.trim() ? (
                <Markdown text={info.notes} />
              ) : (
                <p className="muted">{t('update.noNotes')}</p>
              )}
            </section>
          </>
        )}
        {body}
        {actions && <div className="set-actions">{actions}</div>}
      </div>
    </div>
  );
}
