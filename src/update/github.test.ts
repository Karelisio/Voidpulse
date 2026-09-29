import { describe, expect, it } from 'vitest';
import { apkName, pickRelease, type GhAsset, type GhRelease } from './github';

const HEX = 'a'.repeat(64);

function release(tag: string, opts: Partial<GhRelease> = {}, assets?: GhAsset[]): GhRelease {
  const v = tag.replace(/^v/, '');
  return {
    tag_name: tag,
    name: `Voidpulse ${v}`,
    body: '## Nouveautés',
    draft: false,
    prerelease: false,
    published_at: '2026-09-01T00:00:00Z',
    assets: assets ?? [
      {
        name: apkName(v),
        size: 1000,
        browser_download_url: `https://example.test/${v}.apk`,
        digest: `sha256:${HEX}`,
      },
    ],
    ...opts,
  };
}

describe('choix de la version GitHub', () => {
  it('propose la plus récente, ignore brouillons, anciennes versions et préversions', () => {
    const rs = [
      release('v1.3.0', { draft: true }),
      release('v1.2.1-beta.1', { prerelease: true }),
      release('v1.2.0'),
      release('v1.1.0'),
    ];
    expect(pickRelease(rs, '1.1.0', false)?.version).toBe('1.2.0');
    expect(pickRelease(rs, '1.1.0', true)?.version).toBe('1.2.1-beta.1');
    expect(pickRelease(rs, '1.2.0', false)).toBeNull();
  });

  it('exige l’APK attendu et une empreinte (digest ou fichier .sha256)', () => {
    const noApk = release('v2.0.0', {}, []);
    expect(pickRelease([noApk], '1.0.0', false)).toBeNull();
    const url = 'https://example.test/x.apk';
    const noSum = release('v2.0.0', {}, [
      { name: apkName('2.0.0'), size: 5, browser_download_url: url },
    ]);
    expect(pickRelease([noSum], '1.0.0', false)).toBeNull();
    const sumFile = release('v2.0.0', {}, [
      { name: apkName('2.0.0'), size: 5, browser_download_url: url },
      { name: `${apkName('2.0.0')}.sha256`, size: 1, browser_download_url: `${url}.sha256` },
    ]);
    const info = pickRelease([sumFile], '1.0.0', false);
    expect(info?.sha256).toBeNull();
    expect(info?.sha256Url).toBe(`${url}.sha256`);
    expect(pickRelease([release('v2.0.0')], '1.0.0', false)?.sha256).toBe(HEX);
  });
});
