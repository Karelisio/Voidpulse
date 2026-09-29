/**
 * Lecture des versions publiées sur GitHub Releases : dernière version stable (ou préversion
 * si le joueur l'accepte), fichier APK attendu et son empreinte SHA-256 (champ `digest` de
 * l'API, sinon fichier `.sha256` publié à côté).
 */
import { CapacitorHttp } from '@capacitor/core';
import appConfig from '../../config/app.json';
import { isNative } from '../platform/native';
import { isNewer, parseSemver } from './semver';

export interface GhAsset {
  name: string;
  size: number;
  browser_download_url: string;
  digest?: string | null;
}

export interface GhRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: GhAsset[];
}

export interface UpdateInfo {
  version: string;
  title: string;
  notes: string;
  prerelease: boolean;
  publishedAt: string;
  fileName: string;
  url: string;
  size: number;
  /** Empreinte hexadécimale, ou null s'il faut lire le fichier `.sha256`. */
  sha256: string | null;
  sha256Url: string | null;
}

const API = 'https://api.github.com';

export const versionOf = (tag: string): string => tag.replace(/^v/i, '');

export const apkName = (version: string): string =>
  appConfig.update.apkPattern.replace('{version}', version);

/**
 * Version à proposer parmi `releases` : la plus récente, publiée, plus récente que la version
 * installée et munie de son APK. Null si rien de neuf.
 */
export function pickRelease(
  releases: readonly GhRelease[],
  installed: string,
  allowPrerelease: boolean,
): UpdateInfo | null {
  let best: UpdateInfo | null = null;
  for (const r of releases) {
    if (r.draft || (r.prerelease && !allowPrerelease)) continue;
    const version = versionOf(r.tag_name);
    if (!parseSemver(version) || !isNewer(version, installed)) continue;
    if (best && !isNewer(version, best.version)) continue;
    const fileName = apkName(version);
    const apk = r.assets.find((a) => a.name === fileName);
    if (!apk) continue;
    const digest = apk.digest?.startsWith('sha256:') ? apk.digest.slice(7).toLowerCase() : null;
    const sumFile = r.assets.find((a) => a.name === `${fileName}.sha256`);
    if (!digest && !sumFile) continue;
    best = {
      version,
      title: r.name ?? r.tag_name,
      notes: r.body ?? '',
      prerelease: r.prerelease,
      publishedAt: r.published_at ?? '',
      fileName,
      url: apk.browser_download_url,
      size: apk.size,
      sha256: digest,
      sha256Url: sumFile?.browser_download_url ?? null,
    };
  }
  return best;
}

/** GET texte ou JSON : CapacitorHttp sur Android (sans CORS), fetch sur le web. */
async function get(url: string, json: boolean): Promise<unknown> {
  const headers: Record<string, string> = json
    ? { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    : {};
  if (isNative()) {
    const res = await CapacitorHttp.get({ url, headers, responseType: json ? 'json' : 'text' });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${String(res.status)}`);
    return res.data as unknown;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  return json ? ((await res.json()) as unknown) : await res.text();
}

/** Interroge GitHub et renvoie la version à proposer, ou null. */
export async function fetchUpdate(
  installed: string,
  allowPrerelease: boolean,
): Promise<UpdateInfo | null> {
  const { owner, repo } = appConfig.github;
  const base = `${API}/repos/${owner}/${repo}/releases`;
  const releases = allowPrerelease
    ? ((await get(`${base}?per_page=15`, true)) as GhRelease[])
    : [(await get(`${base}/latest`, true)) as GhRelease];
  return pickRelease(releases, installed, allowPrerelease);
}

/** Empreinte attendue : `digest` de l'API, sinon première chaîne hexadécimale du `.sha256`. */
export async function resolveSha256(info: UpdateInfo): Promise<string> {
  if (info.sha256) return info.sha256;
  if (!info.sha256Url) throw new Error('sha256');
  const text = String(await get(info.sha256Url, false));
  const hex = /[0-9a-f]{64}/i.exec(text)?.[0];
  if (!hex) throw new Error('sha256');
  return hex.toLowerCase();
}
