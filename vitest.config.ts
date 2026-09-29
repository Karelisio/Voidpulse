import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'sim/**/*.test.ts',
      'scripts/**/*.test.ts',
      'config/**/*.test.ts',
    ],
    environment: 'node',
    // Tests de simulation de plusieurs secondes de jeu : marge pour les machines chargées (CI).
    testTimeout: 30_000,
  },
});
