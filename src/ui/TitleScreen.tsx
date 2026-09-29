import { useEffect, useRef, useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { audio, initAudio } from '../audio';
import { t, useLang } from '../i18n';
import { uiSound } from '../audio/bridge';
import { questsReady } from '../meta/quests';
import { seasonTier } from '../meta/season';
import { useSave } from '../state/save';
import { useUi } from '../state/ui';
import { TitleWelcome } from './TitleWelcome';

const VERSION = import.meta.env.VITE_APP_VERSION ?? 'prototype';

export function TitleScreen({
  onPlay,
  onProgression,
  onGoals,
}: {
  onPlay: (bench: boolean) => void;
  onProgression: () => void;
  onGoals: () => void;
}) {
  useLang();
  const debugUnlocked = useUi((s) => s.debugUnlocked);
  const unlockDebug = useUi((s) => s.unlockDebug);
  const taps = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Récompenses en attente : quêtes terminées et paliers de saison atteints.
  const ready = useSave((s) => {
    const d = s.data;
    const tiers = seasonTier(d) - d.retention.season.claimed.length;
    return questsReady(d) + Math.max(0, tiers);
  });

  useEffect(() => {
    void initAudio().then((engine) => {
      if (!engine) return;
      engine.setPaused(false);
      engine.setEveil(false);
      void engine.music?.play('menu');
    });
  }, []);

  return (
    <main className="title">
      <div className="title-mark" aria-hidden="true">
        <span className="pulse-ring" />
        <span className="pulse-ring delay" />
      </div>
      <h1 className="wordmark">VOIDPULSE</h1>
      <p className="tagline">{t('title.tagline')}</p>
      <TitleWelcome />
      <div className="title-actions">
        <button
          className="btn-primary"
          id="play"
          onClick={() => {
            uiSound(audio(), 'ui.confirm');
            onPlay(false);
          }}
        >
          {t('title.play')}
        </button>
        <button
          className="btn-ghost"
          id="progression"
          onClick={() => {
            uiSound(audio(), 'ui.click');
            onProgression();
          }}
        >
          {t('title.progression')}
        </button>
        <button
          className="btn-ghost"
          id="goals"
          onClick={() => {
            uiSound(audio(), 'ui.click');
            onGoals();
          }}
        >
          {t('title.goals')}
          {ready > 0 && <span className="badge">{ready}</span>}
        </button>
        {debugUnlocked && (
          <button
            className="btn-ghost"
            id="bench"
            onClick={() => {
              onPlay(true);
            }}
          >
            {t('title.bench')}
          </button>
        )}
      </div>
      <button
        className="btn-ghost"
        id="settings"
        onClick={() => {
          uiSound(audio(), 'ui.click');
          setSettingsOpen(true);
        }}
      >
        {t('settings.title')}
      </button>
      {settingsOpen && (
        <SettingsPanel
          onClose={() => {
            uiSound(audio(), 'ui.back');
            setSettingsOpen(false);
          }}
        />
      )}
      <p className="hint">{t('title.hint')}</p>
      <button
        className="version"
        onClick={() => {
          taps.current++;
          if (taps.current >= 7) unlockDebug();
        }}
      >
        {VERSION}
        {debugUnlocked ? ' · debug' : ''}
      </button>
    </main>
  );
}
