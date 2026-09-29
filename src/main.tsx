import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initSave } from './state/save';
import { hideSplash } from './platform/android';
import { watchPrefs } from './state/prefs';
import { startSession } from './state/session';
import { checkForUpdates, initUpdater } from './update/updater';
import './styles.css';
import './theme/themes.css';

watchPrefs();
void initSave().then(async () => {
  startSession();
  hideSplash();
  // Vérification automatique (au plus une fois par jour) : la feuille ne s'affiche qu'à l'accueil.
  await initUpdater();
  await checkForUpdates(false);
});

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
