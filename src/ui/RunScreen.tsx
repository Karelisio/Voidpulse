import { useCallback, useEffect, useRef, useState } from 'react';
import { ENEMIES, WEAPONS } from '../content/data';
import { audio, initAudio } from '../audio';
import { GameAudio, uiSound } from '../audio/bridge';
import { GameHost } from '../game/host';
import { useSave } from '../state/save';
import { useUi, type LevelUpView } from '../state/ui';
import { SettingsPanel } from './SettingsPanel';
import type { RunStatus } from '../systems/state';
import { cardView, rewardView, rouletteIcons } from './cards';
import { ChestOverlay } from './ChestOverlay';
import { PactOverlay, type PactView } from './PactOverlay';
import { recordStage } from '../meta/stages';
import { applyUnlocks } from '../meta/unlocks';
import { buildRun, MODE_INFO, type ModeRun } from '../modes/modes';
import { recordMode } from '../modes/records';
import { colorOf, type ModeId } from '../content/data';
import { heat, rankIndex, runScore } from '../systems/pacts';
import { AltarOverlay, MerchantOverlay } from './EventOverlays';
import { altarResultText, altarView, merchantView } from './events';
import { EndOverlay } from './EndOverlay';
import { LevelUpOverlay } from './LevelUpOverlay';
import { MusicViz } from './MusicViz';
import { TrainingPanel } from './TrainingPanel';
import { buildSummary, type RunRecord } from './summary';

declare global {
  interface Window {
    /** Accès debug / bench (outils de mesure). */
    __voidpulse?: GameHost;
  }
}

function showMerchantOf(host: GameHost): void {
  const st = host.sim.state;
  if (!st.merchant) return;
  useUi
    .getState()
    .showMerchant(
      merchantView(st.merchant.offers, st.stats.fragments, host.renderer.atlas.iconUrls),
    );
}

function showAltarOf(host: GameHost): void {
  const altar = host.sim.state.altar;
  if (!altar) return;
  useUi.getState().showAltar({
    offers: altarView(altar.offers),
    result: altar.result ? altarResultText(altar.result) : null,
  });
}

function levelUpView(host: GameHost): LevelUpView {
  const lu = host.sim.state.levelUp;
  const urls = host.renderer.atlas.iconUrls;
  const owned = host.sim.state.weapons.map((w) => ({ defIndex: w.defIndex, evolved: w.evolved }));
  return {
    cards: lu.choices.map((c) => cardView(c, urls, owned)),
    rerolls: lu.rerolls,
    banishes: lu.banishes,
    locks: lu.locks,
    locked: lu.locked ? cardView(lu.locked, urls).key : null,
    level: host.sim.state.player.level - host.sim.state.player.pendingLevels + 1,
  };
}

/** Partie en cours : ce que le mode a construit, et si l'essai du jour est compté. */
interface ActiveRun {
  mode: ModeId;
  run: ModeRun;
  counted: boolean;
}

/** Construit la partie du mode choisi ; le défi du jour marque son essai dès le départ. */
function setupRun(bench: boolean, again = false): ActiveRun {
  const prefs = useSave.getState().data;
  const mode = bench ? 'campaign' : useUi.getState().mode;
  const run = buildRun({
    mode,
    character: prefs.profile.character,
    stage: bench ? 'proto' : prefs.profile.stage,
    loadout: prefs.profile.loadout,
    now: new Date(),
    nonce: `run-${String(Date.now())}`,
  });
  if (bench) run.options.pactChoice = false;
  // Essai du jour : seule la première partie lancée depuis le choix du mode compte.
  const ui = useUi.getState();
  const counted = mode === 'daily' && !again && ui.dailyCounted;
  return { mode, run, counted };
}

/**
 * Fin de partie, écrite tout de suite : statistiques de carrière (hors entraînement), meilleurs
 * rang et score, progression de campagne, records du mode, fragments, déblocages.
 */
function recordRun(host: GameHost, active: ActiveRun): RunRecord {
  const st = host.sim.state;
  const score = runScore(st);
  const rank = rankIndex(heat(st));
  const { mode, run } = active;
  const out: RunRecord = {
    bestScore: false,
    unlocked: [],
    stages: [],
    bosses: [],
    mode: MODE_INFO[mode].name,
    modeDetail: run.detail,
    modeLines: [],
  };
  const before = useSave.getState().data;
  const counts = mode !== 'training';
  out.bestScore = counts && score > before.profile.bestScore;
  void useSave.getState().commit((d) => {
    const result = recordMode(d, {
      mode,
      stage: st.stage.name,
      character: st.character.name,
      victory: st.status === 'victory',
      score,
      time: st.time,
      bosses: st.stats.bossesDefeated.length,
      fragments: st.stats.fragments,
      period: run.period,
      counted: active.counted,
      at: Date.now(),
    });
    out.modeLines = result.lines;
    if (!counts) return;
    const s = d.stats;
    s.runs++;
    if (st.status === 'victory') s.victories++;
    s.kills += st.stats.kills;
    s.elites += st.stats.elitesKilled;
    s.bestTime = Math.max(s.bestTime, st.time);
    s.bestLevel = Math.max(s.bestLevel, st.player.level);
    s.playSeconds += st.time;
    d.profile.bestScore = Math.max(d.profile.bestScore, score);
    // Le rang ne compte qu'en cas de victoire (sinon, des pactes suivis d'une défaite suffiraient).
    if (st.status === 'victory') d.profile.bestRank = Math.max(d.profile.bestRank, rank);
    // La campagne n'avance qu'en Campagne et en Hardcore ; les boss vaincus comptent partout.
    const campaign = mode === 'campaign' || mode === 'hardcore';
    const progress = recordStage(d, {
      stage: campaign ? st.stage.id : '',
      victory: st.status === 'victory',
      score,
      time: st.time,
      rank,
      bosses: st.stats.bossesDefeated,
    });
    out.stages = progress.stages.map((x) => x.name);
    out.bosses = progress.bosses;
    out.unlocked = applyUnlocks(d).map((c) => c.name);
  });
  return out;
}

/** Bandeau d'ouverture des modes autres que la campagne. */
function announce(host: GameHost, active: ActiveRun): void {
  if (active.mode === 'campaign') return;
  const info = MODE_INFO[active.mode];
  const detail =
    active.mode === 'daily' && !active.counted
      ? `${active.run.detail} · hors classement`
      : active.run.detail;
  host.renderer.hud.banner(info.name.toUpperCase(), detail, colorOf(info.color), 3);
}

function pactView(host: GameHost): PactView {
  const st = host.sim.state;
  return {
    offer: [...st.pacts.offer],
    picks: st.pacts.picks,
    heat: heat(st),
    start: st.time === 0,
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
  const { showLevelUp, showChest, showEnd, setOverlay, toggleDebugPanel } = useUi.getState();
  const chest = useUi((s) => s.chest);
  const merchant = useUi((s) => s.merchant);
  const altar = useUi((s) => s.altar);
  const pact = useUi((s) => s.pact);
  const [host, setHost] = useState<GameHost | null>(null);
  const activeRef = useRef<ActiveRun | null>(null);
  const training = useUi((s) => s.mode) === 'training' && !bench;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugWeapon, setDebugWeapon] = useState(0);
  const [debugEnemy, setDebugEnemy] = useState(0);

  const onStatus = useCallback(
    (host: GameHost, status: RunStatus) => {
      if (status === 'levelup') showLevelUp(levelUpView(host));
      else if (status === 'chest') {
        const urls = host.renderer.atlas.iconUrls;
        const rewards = host.sim.state.chest?.rewards ?? [];
        showChest({
          cards: rewards.map((r, i) => rewardView(r, urls, i)),
          roulette: rouletteIcons(urls),
        });
      } else if (status === 'pact') useUi.getState().showPact(pactView(host));
      else if (status === 'merchant') showMerchantOf(host);
      else if (status === 'altar') showAltarOf(host);
      else if (status === 'dead' || status === 'victory') {
        const active = activeRef.current;
        if (!active) return;
        const record = recordRun(host, active);
        window.setTimeout(() => {
          showEnd(buildSummary(host.sim, host.renderer.atlas.iconUrls, record));
        }, 900);
      } else if (useUi.getState().overlay === 'levelup') setOverlay(null);
    },
    [showLevelUp, showChest, showEnd, setOverlay],
  );

  useEffect(() => {
    let disposed = false;
    const el = mount.current;
    if (!el) return;
    const prefs = useSave.getState().data;
    const active = setupRun(bench);
    activeRef.current = active;
    const quality = {
      resolution: prefs.display.resolution,
      particles: prefs.display.particles,
      damageNumbers: prefs.display.damageNumbers,
      shake: prefs.display.shake,
      reduceFlashes: prefs.display.reduceFlashes,
    };
    const inputSettings = {
      sensitivity: prefs.controls.sensitivity,
      leftHanded: prefs.controls.leftHanded,
      aim: prefs.controls.aim,
    };
    void Promise.all([
      GameHost.create(el, active.run.seed, quality, inputSettings, active.run.options),
      initAudio(),
    ]).then(([host, engine]) => {
      if (disposed) {
        host.destroy();
        return;
      }
      hostRef.current = host;
      window.__voidpulse = host;
      host.applyPrefs(prefs.controls, prefs.display);
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
      announce(host, active);
      setHost(host);
    });
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

  // Réglages modifiés en cours de partie (panneau de pause).
  const controls = useSave((s) => s.data.controls);
  const display = useSave((s) => s.data.display);
  useEffect(() => {
    host?.applyPrefs(controls, display);
  }, [host, controls, display]);

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
      {overlay === 'chest' && chest && host && (
        <ChestOverlay
          view={chest}
          onDone={() => {
            setOverlay(null);
            host.sim.closeChest();
          }}
        />
      )}
      {overlay === 'pact' && pact && host && (
        <PactOverlay
          key={pact.offer.join(',')}
          view={pact}
          onSeal={(choices) => {
            uiSound(audio(), choices.length > 0 ? 'ui.confirm' : 'ui.back');
            setOverlay(null);
            host.sim.sealPacts(choices);
          }}
        />
      )}
      {overlay === 'merchant' && merchant && host && (
        <MerchantOverlay
          view={merchant}
          onBuy={(i) => {
            if (host.sim.buy(i)) showMerchantOf(host);
            else uiSound(audio(), 'ui.back');
          }}
          onLeave={() => {
            uiSound(audio(), 'ui.back');
            setOverlay(null);
            host.sim.closeMerchant();
          }}
        />
      )}
      {overlay === 'altar' && altar && host && (
        <AltarOverlay
          offers={altar.offers}
          result={altar.result}
          onChoose={(kind) => {
            if (host.sim.sacrifice(kind)) showAltarOf(host);
          }}
          onClose={() => {
            uiSound(audio(), altar.result ? 'ui.confirm' : 'ui.back');
            setOverlay(null);
            host.sim.closeAltar();
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
                uiSound(audio(), 'ui.click');
                setSettingsOpen(true);
              }}
            >
              Réglages
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
            const next = setupRun(bench, true);
            activeRef.current = next;
            host.newRun(next.run.seed);
            announce(host, next);
          }}
          onMenu={() => {
            uiSound(audio(), 'ui.back');
            onQuit();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => {
            uiSound(audio(), 'ui.back');
            setSettingsOpen(false);
          }}
        />
      )}
      {host && training && <TrainingPanel host={host} />}
      {debugUnlocked && host && (
        <div className={`debug ${debugPanel ? 'open' : ''}`}>
          <button className="debug-toggle" onClick={toggleDebugPanel}>
            DBG
          </button>
          {debugPanel && (
            <div className="debug-body">
              <MusicViz />
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
                <select
                  id="debug-weapon"
                  value={debugWeapon}
                  onChange={(e) => {
                    setDebugWeapon(Number(e.target.value));
                  }}
                >
                  {WEAPONS.map((w, i) => (
                    <option key={w.id} value={i}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    host.sim.debugWeapon(debugWeapon);
                  }}
                >
                  Arme +1
                </button>
                <button
                  onClick={() => {
                    host.sim.debugEvolve(debugWeapon);
                  }}
                >
                  Évoluer
                </button>
              </div>
              <div className="debug-row">
                <select
                  id="debug-enemy"
                  value={debugEnemy}
                  onChange={(e) => {
                    setDebugEnemy(Number(e.target.value));
                  }}
                >
                  {ENEMIES.map((e, i) => (
                    <option key={e.id} value={i}>
                      {e.name}
                    </option>
                  ))}
                </select>
                {[1, 10, 50].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      host.sim.debugSpawn(debugEnemy, n);
                    }}
                  >
                    +{n}
                  </button>
                ))}
                <button
                  onClick={() => {
                    host.sim.debugElite(debugEnemy);
                  }}
                >
                  Élite
                </button>
              </div>
              <div className="debug-row">
                {(
                  [
                    ['merchant', 'Marchand'],
                    ['altar', 'Autel'],
                    ['horde', 'Horde'],
                    ['rift', 'Faille'],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    onClick={() => {
                      host.sim.debugRunEvent(kind);
                    }}
                  >
                    {label}
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
                <button
                  onClick={() => {
                    host.startBench({ enemies: 650, shots: 1100, mix: true });
                  }}
                >
                  Charge mixte
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
