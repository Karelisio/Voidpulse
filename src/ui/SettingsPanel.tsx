/**
 * Réglages : audio, contrôles, affichage, sauvegarde (export / import / réinitialisation).
 * Chaque modification est appliquée immédiatement et sauvegardée (écriture différée).
 */
import { useState, type ReactNode } from 'react';
import { num, setLanguage, t, useLang, type TKey } from '../i18n';
import { QUALITY_PRESETS, type SaveData } from '../save/schema';
import { notificationsAvailable, requestNotifications } from '../platform/notify';
import { useSave } from '../state/save';
import { syncNotifications } from '../state/session';

type Tab = 'audio' | 'controls' | 'display' | 'alerts' | 'save';

const TABS: { id: Tab; label: TKey }[] = [
  { id: 'audio', label: 'settings.tabAudio' },
  { id: 'controls', label: 'settings.tabControls' },
  { id: 'display', label: 'settings.tabDisplay' },
  { id: 'alerts', label: 'settings.tabAlerts' },
  { id: 'save', label: 'settings.tabSave' },
];

/** Couleurs d'accent proposées pour Material You. */
const ACCENTS = ['#7c5cff', '#3e8bff', '#1fa38a', '#e0a100', '#e5533d', '#d0459a'];

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="set-row">
      <div className="set-label">
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Slider(props: {
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { id, value, min, max, step, format, onChange } = props;
  return (
    <>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
      />
      <output htmlFor={id}>
        {format ? format(value) : `${String(Math.round(value * 100))} %`}
      </output>
    </>
  );
}

function Toggle({
  id,
  value,
  onChange,
}: {
  id: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={value}
      className={`set-switch ${value ? 'on' : ''}`}
      onClick={() => {
        onChange(!value);
      }}
    >
      <span />
    </button>
  );
}

function Choice<T extends string | number>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="set-choice" role="radiogroup">
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={props.value === o.value}
          className={props.value === o.value ? 'on' : ''}
          onClick={() => {
            props.onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const db = (v: number): string => `${v > 0 ? '+' : ''}${String(v)} dB`;

function AudioTab({ d, set }: { d: SaveData; set: (fn: (d: SaveData) => void) => void }) {
  useLang();
  const a = d.audio;
  const vol = (key: 'master' | 'music' | 'sfx' | 'ui' | 'ambience', label: string) => (
    <Row label={label}>
      <Slider
        id={`vol-${key}`}
        value={a[key]}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => {
          set((s) => {
            s.audio[key] = v;
          });
        }}
      />
    </Row>
  );
  return (
    <>
      {vol('master', t('settings.volMaster'))}
      {vol('music', t('settings.volMusic'))}
      {vol('sfx', t('settings.volSfx'))}
      {vol('ui', t('settings.volUi'))}
      {vol('ambience', t('settings.volAmbience'))}
      <Row label={t('settings.bass')}>
        <Slider
          id="eq-bass"
          value={a.bassDb}
          min={-12}
          max={12}
          step={1}
          format={db}
          onChange={(v) => {
            set((s) => {
              s.audio.bassDb = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.treble')}>
        <Slider
          id="eq-treble"
          value={a.trebleDb}
          min={-12}
          max={12}
          step={1}
          format={db}
          onChange={(v) => {
            set((s) => {
              s.audio.trebleDb = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.headphones')} hint={t('settings.headphonesHint')}>
        <Toggle
          id="headphones"
          value={a.headphones}
          onChange={(v) => {
            set((s) => {
              s.audio.headphones = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.mute')}>
        <Toggle
          id="muted"
          value={a.muted}
          onChange={(v) => {
            set((s) => {
              s.audio.muted = v;
            });
          }}
        />
      </Row>
    </>
  );
}

function ControlsTab({ d, set }: { d: SaveData; set: (fn: (d: SaveData) => void) => void }) {
  useLang();
  const c = d.controls;
  return (
    <>
      <Row label={t('settings.sensitivity')}>
        <Slider
          id="sensitivity"
          value={c.sensitivity}
          min={0.6}
          max={1.6}
          step={0.05}
          format={(v) => `×${num(v, 2)}`}
          onChange={(v) => {
            set((s) => {
              s.controls.sensitivity = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.aim')} hint={t('settings.aimHint')}>
        <Choice
          value={c.aim}
          options={[
            { value: 'auto', label: t('settings.aimAuto') },
            { value: 'direction', label: t('settings.aimDirection') },
          ]}
          onChange={(v) => {
            set((s) => {
              s.controls.aim = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.leftHanded')} hint={t('settings.leftHandedHint')}>
        <Toggle
          id="left-handed"
          value={c.leftHanded}
          onChange={(v) => {
            set((s) => {
              s.controls.leftHanded = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.haptics')}>
        <Toggle
          id="haptics"
          value={c.haptics}
          onChange={(v) => {
            set((s) => {
              s.controls.haptics = v;
            });
          }}
        />
      </Row>
    </>
  );
}

function DisplayTab({ d, set }: { d: SaveData; set: (fn: (d: SaveData) => void) => void }) {
  useLang();
  const p = d.display;
  const custom = (fn: (s: SaveData) => void) => {
    set((s) => {
      fn(s);
      s.display.preset = 'custom';
    });
  };
  return (
    <>
      <Row label={t('settings.quality')}>
        <Choice
          value={p.preset}
          options={[
            { value: 'low', label: t('settings.qualityLow') },
            { value: 'medium', label: t('settings.qualityMedium') },
            { value: 'high', label: t('settings.qualityHigh') },
            { value: 'custom', label: t('settings.qualityCustom') },
          ]}
          onChange={(v) => {
            set((s) => {
              s.display.preset = v;
              if (v !== 'custom') Object.assign(s.display, QUALITY_PRESETS[v]);
            });
          }}
        />
      </Row>
      <Row label={t('settings.resolution')} hint={t('settings.resolutionHint')}>
        <Slider
          id="resolution"
          value={p.resolution}
          min={0.5}
          max={1}
          step={0.05}
          onChange={(v) => {
            custom((s) => {
              s.display.resolution = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.particles')}>
        <Slider
          id="particles"
          value={p.particles}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => {
            custom((s) => {
              s.display.particles = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.fps')}>
        <Choice
          value={p.fpsCap}
          options={[
            { value: 30, label: '30' },
            { value: 60, label: '60' },
          ]}
          onChange={(v) => {
            custom((s) => {
              s.display.fpsCap = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.shake')}>
        <Slider
          id="shake"
          value={p.shake}
          min={0}
          max={1}
          step={0.1}
          onChange={(v) => {
            set((s) => {
              s.display.shake = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.damageNumbers')}>
        <Toggle
          id="damage-numbers"
          value={p.damageNumbers}
          onChange={(v) => {
            set((s) => {
              s.display.damageNumbers = v;
            });
          }}
        />
      </Row>
      <Row label={t('settings.reduceFlashes')} hint={t('settings.reduceFlashesHint')}>
        <Toggle
          id="reduce-flashes"
          value={p.reduceFlashes}
          onChange={(v) => {
            set((s) => {
              s.display.reduceFlashes = v;
            });
          }}
        />
      </Row>
      <Row label={t('core.language')}>
        <Choice
          value={p.language}
          options={[
            { value: 'fr', label: t('core.french') },
            { value: 'en', label: t('core.english') },
          ]}
          onChange={(v) => {
            set((s) => {
              s.display.language = v;
            });
            setLanguage(v);
          }}
        />
      </Row>
      <Row label={t('settings.theme')}>
        <Choice
          value={p.theme}
          options={[
            { value: 'arcade', label: t('settings.themeArcade') },
            { value: 'material', label: t('settings.themeMaterial') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
          onChange={(v) => {
            set((s) => {
              s.display.theme = v;
            });
          }}
        />
      </Row>
      {p.theme === 'material' && (
        <>
          <Row label={t('settings.accent')}>
            <div className="set-choice" role="radiogroup">
              {ACCENTS.map((hex) => (
                <button
                  key={hex}
                  role="radio"
                  aria-checked={p.accent === hex}
                  aria-label={t('settings.swatchAria', { hex })}
                  className={p.accent === hex ? 'on' : ''}
                  style={{
                    background: hex,
                    width: 36,
                    height: 36,
                    padding: 0,
                    borderRadius: '50%',
                  }}
                  onClick={() => {
                    set((s) => {
                      s.display.accent = hex;
                    });
                  }}
                />
              ))}
            </div>
          </Row>
          <Row label={t('settings.hudAccent')}>
            <Toggle
              id="hud-accent"
              value={p.hudAccent}
              onChange={(v) => {
                set((s) => {
                  s.display.hudAccent = v;
                });
              }}
            />
          </Row>
        </>
      )}
      <Row label={t('settings.colorblind')}>
        <Choice
          value={p.colorblind}
          options={[
            { value: 'off', label: t('settings.colorblindOff') },
            { value: 'deuteranopia', label: t('settings.colorblindDeuteranopia') },
            { value: 'protanopia', label: t('settings.colorblindProtanopia') },
            { value: 'tritanopia', label: t('settings.colorblindTritanopia') },
          ]}
          onChange={(v) => {
            set((s) => {
              s.display.colorblind = v;
            });
          }}
        />
      </Row>
    </>
  );
}

/** Notifications locales facultatives (désactivées par défaut). */
function AlertsTab({ d, set }: { d: SaveData; set: (fn: (d: SaveData) => void) => void }) {
  useLang();
  const n = d.retention.notifications;
  const [denied, setDenied] = useState(false);
  const toggle = (key: 'quests' | 'chest' | 'challenge', label: string, id: string) => (
    <Row label={label}>
      <Toggle
        id={id}
        value={n[key]}
        onChange={(v) => {
          set((s) => {
            s.retention.notifications[key] = v;
          });
          syncNotifications();
        }}
      />
    </Row>
  );
  return (
    <>
      <p className="set-note">
        {t('settings.alertsNote')}
        {!notificationsAvailable() && ` ${t('settings.androidOnly')}`}
      </p>
      <Row label={t('settings.notifications')}>
        <Toggle
          id="notify-enabled"
          value={n.enabled}
          onChange={(v) => {
            const apply = (on: boolean): void => {
              set((s) => {
                s.retention.notifications.enabled = on;
              });
              syncNotifications();
            };
            if (!v || !notificationsAvailable()) {
              apply(v);
              return;
            }
            void requestNotifications().then((ok) => {
              setDenied(!ok);
              apply(ok);
            });
          }}
        />
      </Row>
      {denied && <p className="set-note">{t('settings.notifDenied')}</p>}
      {n.enabled && (
        <>
          {toggle('quests', t('settings.notifQuests'), 'notify-quests')}
          {toggle('challenge', t('settings.notifChallenge'), 'notify-challenge')}
          {toggle('chest', t('settings.notifChest'), 'notify-chest')}
        </>
      )}
    </>
  );
}

function SaveTab() {
  useLang();
  const exportText = useSave((s) => s.exportText);
  const importText = useSave((s) => s.importText);
  const reset = useSave((s) => s.reset);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <>
      <p className="set-note">{t('settings.saveNote')}</p>
      <div className="set-actions">
        <button
          className="btn-ghost"
          onClick={() => {
            const exported = exportText();
            setText(exported);
            navigator.clipboard.writeText(exported).then(
              () => {
                setMessage(t('settings.copied'));
              },
              () => {
                setMessage(t('settings.copyFailed'));
              },
            );
          }}
        >
          {t('settings.export')}
        </button>
        <button
          className="btn-ghost"
          disabled={text.trim().length === 0}
          onClick={() => {
            importText(text).then(
              () => {
                setMessage(t('settings.imported'));
              },
              (e: unknown) => {
                setMessage(e instanceof Error ? e.message : String(e));
              },
            );
          }}
        >
          {t('settings.importText')}
        </button>
      </div>
      <textarea
        id="save-text"
        className="set-text"
        rows={4}
        placeholder={t('settings.pastePlaceholder')}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      {message && (
        <p className="set-note" role="status">
          {message}
        </p>
      )}
      <div className="set-actions">
        {confirmReset ? (
          <>
            <span className="set-warn">{t('settings.resetWarn')}</span>
            <button
              className="btn-ghost danger"
              onClick={() => {
                void reset().then(() => {
                  setConfirmReset(false);
                  setMessage(t('settings.resetDone'));
                });
              }}
            >
              {t('core.confirm')}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setConfirmReset(false);
              }}
            >
              {t('core.cancel')}
            </button>
          </>
        ) : (
          <button
            className="btn-ghost danger"
            onClick={() => {
              setConfirmReset(true);
            }}
          >
            {t('settings.resetButton')}
          </button>
        )}
      </div>
    </>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  useLang();
  const d = useSave((s) => s.data);
  const update = useSave((s) => s.update);
  const error = useSave((s) => s.error);
  const [tab, setTab] = useState<Tab>('audio');
  return (
    <div className="overlay settings" role="dialog" aria-label={t('settings.title')}>
      <div className="set-panel">
        <header className="set-head">
          <h2>{t('settings.title')}</h2>
          <button className="btn-ghost" onClick={onClose}>
            {t('core.close')}
          </button>
        </header>
        {error && <p className="set-warn">{error}</p>}
        <nav className="set-tabs" role="tablist">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              role="tab"
              aria-selected={tab === tb.id}
              className={tab === tb.id ? 'on' : ''}
              onClick={() => {
                setTab(tb.id);
              }}
            >
              {t(tb.label)}
            </button>
          ))}
        </nav>
        <div className="set-body" role="tabpanel">
          {tab === 'audio' && <AudioTab d={d} set={update} />}
          {tab === 'controls' && <ControlsTab d={d} set={update} />}
          {tab === 'display' && <DisplayTab d={d} set={update} />}
          {tab === 'alerts' && <AlertsTab d={d} set={update} />}
          {tab === 'save' && <SaveTab />}
        </div>
      </div>
    </div>
  );
}
