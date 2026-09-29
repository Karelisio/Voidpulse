/** Progression permanente : compte et Paragon, talents, reliques, maîtrise, codex. */
import { useState } from 'react';
import { useSave } from '../../state/save';
import { AccountTab } from './AccountTab';
import { CodexTab } from './CodexTab';
import { fmt, sfx } from './common';
import { MasteryTab } from './MasteryTab';
import { RelicsTab } from './RelicsTab';
import { TalentsTab } from './TalentsTab';
import './meta.css';

const TABS = [
  { id: 'account', label: 'Compte' },
  { id: 'talents', label: 'Talents' },
  { id: 'relics', label: 'Reliques' },
  { id: 'mastery', label: 'Maîtrise' },
  { id: 'codex', label: 'Codex' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ProgressionScreen({ onBack }: { onBack: () => void }) {
  const fragments = useSave((s) => s.data.wallet.fragments);
  const [tab, setTab] = useState<TabId>('account');

  return (
    <main className="select meta">
      <header className="meta-head">
        <div className="meta-title">
          <h2>Progression</h2>
          <span className="meta-wallet" aria-label="Fragments">
            <b>◆</b> {fmt(fragments)} <small>fragments</small>
          </span>
        </div>
        <nav className="meta-tabs" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'on' : ''}
              onClick={() => {
                sfx('ui.click');
                setTab(t.id);
              }}
            >
              {t.label}
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
        Retour
      </button>
    </main>
  );
}
