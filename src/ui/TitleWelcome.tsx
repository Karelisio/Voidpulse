/** Accueil de l'écran titre : série de connexion du jour, coffre hors ligne. */
import { useEffect, useState } from 'react';
import { audio } from '../audio';
import { uiSound } from '../audio/bridge';
import { chestAmount, chestCapacity, claimChest } from '../meta/chest';
import { readNow, safeNow } from '../meta/clock';
import { useSave } from '../state/save';
import { useSession } from '../state/session';

const fmt = (n: number): string => n.toLocaleString('fr-FR');

export function TitleWelcome() {
  const data = useSave((s) => s.data);
  const welcome = useSession((s) => s.welcome);
  const dismiss = useSession((s) => s.dismissWelcome);
  const [now, setNow] = useState(() => readNow(data));
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(readNow(useSave.getState().data));
    }, 15000);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  const amount = chestAmount(data, now);
  const cap = chestCapacity(data);
  const [claimed, setClaimed] = useState(0);

  return (
    <div className="welcome">
      {welcome?.streak && (
        <button
          className="welcome-streak"
          id="streak-ok"
          onClick={() => {
            uiSound(audio(), 'ui.confirm');
            dismiss();
          }}
        >
          <b>Série : jour {welcome.streak.count}</b>
          <span>+{fmt(welcome.streak.reward)} ◆</span>
          {welcome.seasonGranted > 0 && (
            <small>Saison terminée : {welcome.seasonGranted} palier(s) versé(s)</small>
          )}
        </button>
      )}
      {data.retention.chest.last > 0 && (
        <div className="welcome-chest">
          <div>
            <b>Coffre hors ligne</b>
            <span className="welcome-bar" aria-hidden="true">
              <i
                style={{ width: `${String(Math.min(100, (amount / Math.max(1, cap)) * 100))}%` }}
              />
            </span>
            <small>
              {claimed > 0 ? `+${fmt(claimed)} ◆ récupérés` : `${fmt(amount)} / ${fmt(cap)} ◆`}
            </small>
          </div>
          <button
            className="btn-ghost"
            id="chest-claim"
            disabled={amount < 1}
            onClick={() => {
              uiSound(audio(), 'ui.confirm');
              let got = 0;
              useSave.getState().update((d) => {
                got = claimChest(d, safeNow(d));
              });
              setClaimed(got);
              setNow(readNow(useSave.getState().data));
            }}
          >
            Récupérer
          </button>
        </div>
      )}
    </div>
  );
}
