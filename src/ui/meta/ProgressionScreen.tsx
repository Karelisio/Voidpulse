/** Progression permanente : compte et Paragon, talents, reliques, maîtrise, codex. */
import { useState } from 'react';
import { useLang, t, type TKey } from '../../i18n';
import { useSave } from '../../state/save';
import { AccountTab } from './AccountTab';
import { CodexTab } from './CodexTab';
import { fmt, sfx } from './common';
import { MasteryTab } from './MasteryTab';
import { RelicsTab } from './RelicsTab';
import { TalentsTab } from './TalentsTab';
import './meta.css';

const TABS = [
  { id: 'account', label: 'meta.tabAccount' },
  { id: 'talents', label: 'meta.tabTalents' },
  { id: 'relics', label: 'meta.tabRelics' },
  { id: 'mastery', label: 'meta.tabMastery' },
  { id: 'codex', label: 'meta.tabCodex' },
] as const satisfies readonly { id: string; label: TKey }[];

type TabId = (typeof TABS)[number]['id'];

export function ProgressionScreen({ onBack }: { onBack: () => void }) {
  useLang();
  const fragments = useSave((s) => s.data.wallet.fragments);
  const [tab, setTab] = useState<TabId>('account');

  return (
    <main className="select meta">
      <header className="meta-head">
        <div className="meta-title">
          <h2>{t('meta.title')}</h2>
          <span className="meta-wallet" aria-label={t('meta.wallet')}>
            <b>◆</b> {fmt(fragments)} <small>{t('meta.walletUnit')}</small>
          </span>
        </div>
        <nav className="meta-tabs" role="tablist" aria-label={t('meta.sections')}>
          {TABS.map((tb) => (
            <button
              key={tb.id}
              id={`tab-${tb.id}`}
              role="tab"
              aria-selected={tab === tb.id}
              className={tab === tb.id ? 'on' : ''}
              onClick={() => {
                sfx('ui.click');
                setTab(tb.id);
              }}
            >
              {t(tb.label)}
            </button>
          ))}
        </nav>
      </header>
      <div className="meta-body" role="tabpanel">
        {tab === 'account' && <AccountTab />}
        {tab === 'talents' && <TalentsTab />}
        {tab === 'relics' && <RelicsTab />}
        {tab === 'mastery' && <MasteryTab />}
        {tab === 'codex' && <CodexTab />}
      </div>
      <button
        className="btn-ghost meta-back"
        onClick={() => {
          sfx('ui.back');
          onBack();
        }}
      >
        {t('core.back')}
      </button>
    </main>
  );
}
