/**
 * Réglages : audio, contrôles, affichage, sauvegarde (export / import / réinitialisation).
 * Chaque modification est appliquée immédiatement et sauvegardée (écriture différée).
 */
import { useState, type ReactNode } from 'react';
import { QUALITY_PRESETS, type SaveData } from '../save/schema';
import { notificationsAvailable, requestNotifications } from '../platform/notify';
import { useSave } from '../state/save';
import { syncNotifications } from '../state/session';

type Tab = 'audio' | 'controls' | 'display' | 'alerts' | 'save';

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'controls', label: 'Contrôles' },
  { id: 'display', label: 'Affichage' },
  { id: 'alerts', label: 'Alertes' },
  { id: 'save', label: 'Sauvegarde' },
];

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
      {vol('master', 'Volume général')}
      {vol('music', 'Musique')}
      {vol('sfx', 'Effets')}
      {vol('ui', 'Interface')}
      {vol('ambience', 'Ambiance')}
      <Row label="Graves">
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
      <Row label="Aigus">
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
      <Row label="Mode casque" hint="Spatialisation élargie des effets">
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
      <Row label="Couper le son">
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
  const c = d.controls;
  return (
    <>
      <Row label="Sensibilité du joystick">
        <Slider
          id="sensitivity"
          value={c.sensitivity}
          min={0.6}
          max={1.6}
          step={0.05}
          format={(v) => `×${v.toFixed(2).replace('.', ',')}`}
          onChange={(v) => {
            set((s) => {
              s.controls.sensitivity = v;
            });
          }}
        />
      </Row>
      <Row label="Visée" hint="Automatique : cible l’ennemi le plus proche">
        <Choice
          value={c.aim}
          options={[
            { value: 'auto', label: 'Automatique' },
            { value: 'direction', label: 'Direction' },
          ]}
          onChange={(v) => {
            set((s) => {
              s.controls.aim = v;
            });
          }}
        />
      </Row>
      <Row label="Mode gaucher" hint="Bouton de dash à gauche">
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
      <Row label="Vibrations">
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
  const p = d.display;
  const custom = (fn: (s: SaveData) => void) => {
    set((s) => {
      fn(s);
      s.display.preset = 'custom';
    });
  };
  return (
    <>
      <Row label="Qualité">
        <Choice
          value={p.preset}
          options={[
            { value: 'low', label: 'Basse' },
            { value: 'medium', label: 'Moyenne' },
            { value: 'high', label: 'Haute' },
            { value: 'custom', label: 'Perso' },
          ]}
          onChange={(v) => {
            set((s) => {
              s.display.preset = v;
              if (v !== 'custom') Object.assign(s.display, QUALITY_PRESETS[v]);
            });
          }}
        />
      </Row>
      <Row label="Résolution" hint="Appliquée à la prochaine partie">
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
      <Row label="Particules">
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
      <Row label="Images par seconde">
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
      <Row label="Tremblement de l’écran">
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
      <Row label="Chiffres de dégâts">
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
      <Row label="Réduire les flashs" hint="Accessibilité (photosensibilité)">
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
    </>
  );
}

/** Notifications locales facultatives (désactivées par défaut). */
function AlertsTab({ d, set }: { d: SaveData; set: (fn: (d: SaveData) => void) => void }) {
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
        Rappels locaux, sans connexion : rien ne quitte l’appareil.
        {!notificationsAvailable() && ' Disponibles dans l’application Android.'}
      </p>
      <Row label="Notifications">
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
      {denied && <p className="set-note">Autorisation refusée dans les réglages d’Android.</p>}
      {n.enabled && (
        <>
          {toggle('quests', 'Nouvelles quêtes', 'notify-quests')}
          {toggle('challenge', 'Nouveau défi du jour', 'notify-challenge')}
          {toggle('chest', 'Coffre hors ligne plein', 'notify-chest')}
        </>
      )}
    </>
  );
}

function SaveTab() {
  const exportText = useSave((s) => s.exportText);
  const importText = useSave((s) => s.importText);
  const reset = useSave((s) => s.reset);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <>
      <p className="set-note">
        Exporte ta progression sous forme de texte pour la garder ailleurs ou la transférer sur un
        autre appareil.
      </p>
      <div className="set-actions">
        <button
          className="btn-ghost"
          onClick={() => {
            const t = exportText();
            setText(t);
            navigator.clipboard.writeText(t).then(
              () => {
                setMessage('Sauvegarde copiée dans le presse-papiers.');
              },
              () => {
                setMessage('Copie impossible : sélectionne le texte ci-dessous.');
              },
            );
          }}
        >
          Exporter
        </button>
        <button
          className="btn-ghost"
          disabled={text.trim().length === 0}
          onClick={() => {
            importText(text).then(
              () => {
                setMessage('Sauvegarde importée.');
              },
              (e: unknown) => {
                setMessage(e instanceof Error ? e.message : String(e));
              },
            );
          }}
        >
          Importer le texte
        </button>
      </div>
      <textarea
        id="save-text"
        className="set-text"
        rows={4}
        placeholder="Colle ici une sauvegarde exportée (VOIDPULSE1:…)"
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
            <span className="set-warn">Toute la progression sera effacée.</span>
            <button
              className="btn-ghost danger"
              onClick={() => {
                void reset().then(() => {
                  setConfirmReset(false);
                  setMessage('Progression réinitialisée.');
                });
              }}
            >
              Confirmer
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setConfirmReset(false);
              }}
            >
              Annuler
            </button>
          </>
        ) : (
          <button
            className="btn-ghost danger"
            onClick={() => {
              setConfirmReset(true);
            }}
          >
            Réinitialiser la progression
          </button>
        )}
      </div>
    </>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const d = useSave((s) => s.data);
  const update = useSave((s) => s.update);
  const error = useSave((s) => s.error);
  const [tab, setTab] = useState<Tab>('audio');
  return (
    <div className="overlay settings" role="dialog" aria-label="Réglages">
      <div className="set-panel">
        <header className="set-head">
          <h2>Réglages</h2>
          <button className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
        </header>
        {error && <p className="set-warn">{error}</p>}
        <nav className="set-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'on' : ''}
              onClick={() => {
                setTab(t.id);
              }}
            >
              {t.label}
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
