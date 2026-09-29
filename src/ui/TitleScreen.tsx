import { useRef } from 'react';
import { useUi } from '../state/ui';

const VERSION = import.meta.env.VITE_APP_VERSION ?? 'prototype';

export function TitleScreen({ onPlay }: { onPlay: (bench: boolean) => void }) {
  const debugUnlocked = useUi((s) => s.debugUnlocked);
  const unlockDebug = useUi((s) => s.unlockDebug);
  const taps = useRef(0);

  return (
    <main className="title">
      <div className="title-mark" aria-hidden="true">
        <span className="pulse-ring" />
        <span className="pulse-ring delay" />
      </div>
      <h1 className="wordmark">VOIDPULSE</h1>
      <p className="tagline">Survis. Combine les éléments. Éveille la Résonance.</p>
      <div className="title-actions">
        <button
          className="btn-primary"
          id="play"
          onClick={() => {
            onPlay(false);
          }}
        >
          Jouer
        </button>
        {debugUnlocked && (
          <button
            className="btn-ghost"
            id="bench"
            onClick={() => {
              onPlay(true);
            }}
          >
            Scénario de charge (650 ennemis, 1 100 projectiles)
          </button>
        )}
      </div>
      <p className="hint">
        Joystick : pose le pouce n'importe où. Dash : un second doigt. Clavier : ZQSD / flèches,
        Espace.
      </p>
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
