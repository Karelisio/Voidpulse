import { useEffect, useRef, useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { UpdateSheet } from './UpdateSheet';
import { useUpdate } from '../update/updater';
import { audio, initAudio } from '../audio';
import { t, useLang } from '../i18n';
import { uiSound } from '../audio/bridge';
import { questsReady } from '../meta/quests';
import { seasonTier } from '../meta/season';
import { useSave } from '../state/save';
import { useUi } from '../state/ui';
import { TitleWelcome } from './TitleWelcome';


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
  const version = useUpdate((s) => s.installed);
  // Récompenses en attente : quêtes terminées et paliers de saison atteints.
  const ready = useSave((s) => {
    const d = s.data;
    const tiers = seasonTier(d) - d.retention.season.claimed.length;
    return questsReady(d) + Math.max(0, tiers);
  });

  // Material You : barre de navigation et bouton flottant à la place de la colonne de boutons.
  const material = useSave((s) => s.data.display.theme === 'material');
  const play = (): void => {
    uiSound(audio(), 'ui.confirm');
    onPlay(false);
  };
  const progression = (): void => {
    uiSound(audio(), 'ui.click');
    onProgression();
  };
  const goals = (): void => {
    uiSound(audio(), 'ui.click');
    onGoals();
  };
  const settings = (): void => {
    uiSound(audio(), 'ui.click');
    setSettingsOpen(true);
  };

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
        {!material && (
          <>
            <button className="btn-primary" id="play" onClick={play}>
              {t('title.play')}
            </button>
            <button className="btn-ghost" id="progression" onClick={progression}>
              {t('title.progression')}
            </button>
            <button className="btn-ghost" id="goals" onClick={goals}>
              {t('title.goals')}
              {ready > 0 && <span className="badge">{ready}</span>}
            </button>
          </>
        )}
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
      {material ? (
        <>
          <button className="m3-fab" id="play" onClick={play}>
            ▶ {t('title.play')}
          </button>
          <nav className="m3-nav" aria-label={t('title.play')}>
            <button id="progression" onClick={progression}>
              <i aria-hidden="true">◆</i>
              {t('title.progression')}
            </button>
            <button id="goals" onClick={goals}>
              <i aria-hidden="true">✓{ready > 0 && <span className="badge">{ready}</span>}</i>
              {t('title.goals')}
            </button>
            <button id="settings" onClick={settings}>
              <i aria-hidden="true">⚙</i>
              {t('settings.title')}
            </button>
          </nav>
        </>
      ) : (
        <button className="btn-ghost" id="settings" onClick={settings}>
          {t('settings.title')}
        </button>
      )}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => {
            uiSound(audio(), 'ui.back');
            setSettingsOpen(false);
          }}
        />
      )}
      <UpdateSheet />
      <p className="hint">{t('title.hint')}</p>
      <button
        className="version"
        onClick={() => {
          taps.current++;
          if (taps.current >= 7) unlockDebug();
        }}
      >
        {version}
        {debugUnlocked ? ' · debug' : ''}
      </button>
    </main>
  );
}
