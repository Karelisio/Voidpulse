import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';

/** Plugins de .releaserc.json, avec leurs options. */
const config = JSON.parse(readFileSync('.releaserc.json', 'utf8')) as {
  plugins: (string | [string, Record<string, unknown>])[];
};
function pluginOptions(name: string): Record<string, unknown> {
  const entry = config.plugins.find((p) => Array.isArray(p) && p[0] === name);
  return Array.isArray(entry) ? entry[1] : {};
}

const context = {
  cwd: process.cwd(),
  env: {},
  options: { repositoryUrl: 'https://github.com/Karelisio/Voidpulse' },
  lastRelease: {},
  nextRelease: { version: '1.1.0', gitTag: 'v1.1.0' },
  logger: { log: () => undefined, error: () => undefined },
  commits: [
    { hash: 'a1b2c3d', message: 'feat(audio): nouvelle piste (#2)' },
    { hash: 'b2c3d4e', message: 'fix: collision des gemmes' },
    { hash: 'c3d4e5f', message: 'chore: dépendances' },
  ],
};

// Les versions du preset conventionalcommits et de semantic-release doivent rester compatibles :
// une incompatibilité ne se voit sinon qu'au moment de publier, après le merge sur main.
describe('notes de version (configuration semantic-release)', () => {
  it('calcule le type de version', async () => {
    const type = await analyzeCommits(pluginOptions('@semantic-release/commit-analyzer'), context);
    expect(type).toBe('minor');
  });

  it('génère les notes avec les sections françaises', async () => {
    const notes = await generateNotes(
      pluginOptions('@semantic-release/release-notes-generator'),
      context,
    );
    expect(notes).toContain('### Nouveautés');
    expect(notes).toContain('### Corrections');
    expect(notes).not.toContain('dépendances');
  });
});
