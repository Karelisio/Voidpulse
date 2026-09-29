import { useState } from 'react';
import { useUi } from './state/ui';
import { CharacterSelect } from './ui/CharacterSelect';
import { RunScreen } from './ui/RunScreen';
import { StageSelect } from './ui/StageSelect';
import { TitleScreen } from './ui/TitleScreen';
import './ui/ui.css';

export function App() {
  const screen = useUi((s) => s.screen);
  const setScreen = useUi((s) => s.setScreen);
  const [bench, setBench] = useState(false);
  const debug = useUi((s) => s.debugUnlocked);

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
  if (screen === 'select') {
    return (
      <CharacterSelect
        forceUnlocked={debug}
        onStart={() => {
          setScreen('stage');
        }}
        onBack={() => {
          setScreen('title');
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
  return (
    <TitleScreen
      onPlay={(b) => {
        setBench(b);
        setScreen(b ? 'run' : 'select');
      }}
    />
  );
}
