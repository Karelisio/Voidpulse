import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // « assets/ » est réservé aux ressources d'exécution (audio, atlas) servies sous /assets/.
    assetsDir: 'bundle',
    sourcemap: true,
  },
  server: {
    host: true,
  },
});
