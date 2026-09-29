import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    target: 'es2022',
    // « assets/ » est réservé aux ressources d'exécution (audio, atlas) servies sous /assets/.
    assetsDir: 'bundle',
    // Pas de cartes de sources dans l'APK (mode « android ») : 3,6 Mo de moins.
    sourcemap: mode !== 'android',
  },
  server: {
    host: true,
  },
}));
