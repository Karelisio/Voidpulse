import { useState } from 'react';
import { dayKey, modeNeeds } from './modes/modes';
import { useBackHandler } from './platform/back';
import { beginDaily } from './modes/records';
import { useSave } from './state/save';
import { useUi } from './state/ui';
import { BuildSelect } from './ui/BuildSelect';
import { CharacterSelect } from './ui/CharacterSelect';
import { ModeSelect } from './ui/ModeSelect';
import { GoalsScreen } from './ui/goals/GoalsScreen';
import { ProgressionScreen } from './ui/meta/ProgressionScreen';
import { RunScreen } from './ui/RunScreen';
import { StageSelect } from './ui/StageSelect';
import { TitleScreen } from './ui/TitleScreen';
import './ui/ui.css';

/**
 * Parcours : titre → mode → pilote (sauf défi du jour) → secteur (Campagne, Hardcore, Infini)
 * ou build (Boss Rush) → partie.
 */
export function App() {
  const screen = useUi((s) => s.screen);
  const setScreen = useUi((s) => s.setScreen);
  const mode = useUi((s) => s.mode);
  const [bench, setBench] = useState(false);
  const debug = useUi((s) => s.debugUnlocked);
  const needs = modeNeeds(mode);
  // Bouton retour : écran précédent ; depuis l'accueil, rien (l'application se ferme).
  useBackHandler(() => {
    const parent: Partial<Record<typeof screen, typeof screen>> = {
      modes: 'title',
      select: 'modes',
      stage: 'select',
      build: 'select',
      progression: 'title',
      goals: 'title',
    };
    const to = parent[screen];
    if (!to) return screen === 'run';
    setScreen(to);
    return true;
  });

  if (screen === 'run') {
    return (
      <RunScreen
        bench={bench}
        onQuit={() => {
          setScreen('title');
        }}
      />
    );
  }
  if (screen === 'modes') {
    return (
      <ModeSelect
        onPick={(m) => {
          // Défi du jour : l'essai compté est pris dès le lancement (quitter ne le rend pas).
          const day = dayKey(new Date());
          const counted = m === 'daily' && useSave.getState().data.modes.daily.day !== day;
          useUi.getState().setMode(m, counted);
          void useSave.getState().commit((d) => {
            d.profile.mode = m;
            if (counted) beginDaily(d, day);
          });
          setScreen(modeNeeds(m).character ? 'select' : 'run');
        }}
        onBack={() => {
          setScreen('title');
        }}
      />
    );
  }
  if (screen === 'select') {
    return (
      <CharacterSelect
        forceUnlocked={debug}
        onStart={() => {
          setScreen(needs.stage ? 'stage' : needs.build ? 'build' : 'run');
        }}
        onBack={() => {
          setScreen('modes');
        }}
      />
    );
  }
  if (screen === 'stage') {
    return (
      <StageSelect
        forceUnlocked={debug}
        onStart={() => {
          setScreen('run');
        }}
        onBack={() => {
          setScreen('select');
        }}
      />
    );
  }
  if (screen === 'build') {
    return (
      <BuildSelect
        onStart={() => {
          setScreen('run');
        }}
        onBack={() => {
          setScreen('select');
        }}
      />
    );
  }
  if (screen === 'goals') {
    return (
      <GoalsScreen
        onBack={() => {
          setScreen('title');
        }}
      />
    );
  }
  if (screen === 'progression') {
    return (
      <ProgressionScreen
        onBack={() => {
          setScreen('title');
        }}
      />
    );
  }
  return (
    <TitleScreen
      onPlay={(b) => {
        setBench(b);
        setScreen(b ? 'run' : 'modes');
      }}
      onProgression={() => {
        setScreen('progression');
      }}
      onGoals={() => {
        setScreen('goals');
      }}
    />
  );
}
