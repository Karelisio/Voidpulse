import { useCallback, useEffect, useRef, useState } from 'react';
import { ENEMIES } from '../content/data';
import { audio, initAudio } from '../audio';
import { GameAudio, uiSound } from '../audio/bridge';
import { GameHost } from '../game/host';
import { useUi, type LevelUpView } from '../state/ui';
import type { RunStatus } from '../systems/state';
import { cardView } from './cards';
import { EndOverlay } from './EndOverlay';
import { LevelUpOverlay } from './LevelUpOverlay';
import { buildSummary } from './summary';

declare global {
  interface Window {
    /** Accès debug / bench (outils de mesure). */
    __voidpulse?: GameHost;
  }
}

function levelUpView(host: GameHost): LevelUpView {
  const lu = host.sim.state.levelUp;
  const urls = host.renderer.atlas.iconUrls;
  return {
    cards: lu.choices.map((c) => cardView(c, urls)),
    rerolls: lu.rerolls,
    banishes: lu.banishes,
    locks: lu.locks,
    locked: lu.locked ? cardView(lu.locked, urls).key : null,
    level: host.sim.state.player.level - host.sim.state.player.pendingLevels + 1,
  };
}

export function RunScreen({ bench, onQuit }: { bench: boolean; onQuit: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const hostRef = useRef<GameHost | null>(null);
  const overlay = useUi((s) => s.overlay);
  const levelUp = useUi((s) => s.levelUp);
  const summary = useUi((s) => s.summary);
  const debugUnlocked = useUi((s) => s.debugUnlocked);
  const debugPanel = useUi((s) => s.debugPanel);
  const { showLevelUp, showEnd, setOverlay, toggleDebugPanel } = useUi.getState();
  const [host, setHost] = useState<GameHost | null>(null);

  const onStatus = useCallback(
    (host: GameHost, status: RunStatus) => {
      if (status === 'levelup') showLevelUp(levelUpView(host));
      else if (status === 'dead' || status === 'victory') {
        window.setTimeout(() => {
          showEnd(buildSummary(host.sim, host.renderer.atlas.iconUrls));
        }, 900);
      } else if (useUi.getState().overlay === 'levelup') setOverlay(null);
    },
    [showLevelUp, showEnd, setOverlay],
  );

  useEffect(() => {
    let disposed = false;
    const el = mount.current;
    if (!el) return;
    void Promise.all([GameHost.create(el, `run-${Date.now()}`), initAudio()]).then(
      ([host, engine]) => {
        if (disposed) {
          host.destroy();
          return;
        }
        hostRef.current = host;
        window.__voidpulse = host;
        if (engine) host.audio = new GameAudio(engine);
        host.onStatus = (status) => {
          onStatus(host, status);
        };
        host.onPauseRequest = () => {
          if (useUi.getState().overlay === null) {
            host.pause();
            setOverlay('pause');
          }
        };
        if (bench) host.startBench({ enemies: 650, shots: 1100 });
        host.start();
        setHost(host);
      },
    );
    const onHide = (): void => {
      const host = hostRef.current;
      if (document.hidden && host && useUi.getState().overlay === null) {
        host.pause();
        setOverlay('pause');
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onHide);
      hostRef.current?.destroy();
      hostRef.current = null;
      if (window.__voidpulse) delete window.__voidpulse;
    };
  }, [bench, onStatus, setOverlay]);

  useEffect(() => {
    host?.setDebugOverlay(debugPanel);
  }, [host, debugPanel]);

  const refreshLevelUp = (): void => {
    if (!host) return;
    if (host.sim.state.status === 'levelup') showLevelUp(levelUpView(host));
  };

  return (
    <div className="run">
      <div className="stage" ref={mount} />
      {host && overlay === null && (
        <button
          className="pause-btn"
          aria-label="Pause"
          onClick={() => {
            uiSound(audio(), 'ui.click');
            host.pause();
            setOverlay('pause');
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          </svg>
        </button>
      )}
      {overlay === 'levelup' && levelUp && host && (
        <LevelUpOverlay
          view={levelUp}
          onChoose={(i) => {
            uiSound(audio(), 'ui.confirm');
            host.sim.choose(i);
            refreshLevelUp();
          }}
          onReroll={() => {
            uiSound(audio(), 'ui.card');
            host.sim.reroll();
            refreshLevelUp();
          }}
          onBanish={(i) => {
            uiSound(audio(), 'ui.back');
            host.sim.banish(i);
            refreshLevelUp();
          }}
          onLock={(i) => {
            uiSound(audio(), 'ui.click');
            host.sim.lock(i);
            refreshLevelUp();
          }}
        />
      )}
      {overlay === 'pause' && host && (
        <div className="overlay pause" role="dialog" aria-label="Pause">
          <h2>Pause</h2>
          <div className="end-actions">
            <button
              className="btn-primary"
              id="resume"
              onClick={() => {
                uiSound(audio(), 'ui.confirm');
                setOverlay(null);
                host.resume();
              }}
            >
              Reprendre
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                uiSound(audio(), 'ui.back');
                onQuit();
              }}
            >
              Quitter la partie
            </button>
          </div>
        </div>
      )}
      {overlay === 'end' && summary && host && (
        <EndOverlay
          summary={summary}
          onAgain={() => {
            uiSound(audio(), 'ui.confirm');
            setOverlay(null);
            host.newRun(`run-${Date.now()}`);
          }}
          onMenu={() => {
            uiSound(audio(), 'ui.back');
            onQuit();
          }}
        />
      )}
      {debugUnlocked && host && (
        <div className={`debug ${debugPanel ? 'open' : ''}`}>
          <button className="debug-toggle" onClick={toggleDebugPanel}>
            DBG
          </button>
          {debugPanel && (
            <div className="debug-body">
              <label>
                <input
                  type="checkbox"
                  defaultChecked={host.sim.state.debug.invincible}
                  onChange={(e) => {
                    host.setInvincible(e.target.checked);
                  }}
                />
                Invincible
              </label>
              <div className="debug-row">
                {[1, 2, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      host.setTimeScale(s);
                    }}
                  >
                    ×{s}
                  </button>
                ))}
              </div>
              <div className="debug-row">
                {ENEMIES.map((e, i) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      host.sim.debugSpawn(i, 50);
                    }}
                  >
                    +50 {e.name}
                  </button>
                ))}
              </div>
              <div className="debug-row">
                <button
                  onClick={() => {
                    host.sim.debugBoss();
                  }}
                >
                  Boss
                </button>
                <button
                  onClick={() => {
                    host.sim.debugEveil();
                  }}
                >
                  Éveil
                </button>
                <button
                  onClick={() => {
                    host.sim.debugLevelUp();
                  }}
                >
                  Niveau +1
                </button>
                <button
                  onClick={() => {
                    host.startBench({ enemies: 650, shots: 1100 });
                  }}
                >
                  Charge
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
