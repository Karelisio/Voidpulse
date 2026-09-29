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
  },
});
