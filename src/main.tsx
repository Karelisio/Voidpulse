import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initSave } from './state/save';
import { watchPrefs } from './state/prefs';
import { startSession } from './state/session';
import './styles.css';
import './theme/themes.css';

watchPrefs();
void initSave().then(startSession);

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
