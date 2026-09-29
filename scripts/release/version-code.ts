/**
 * versionCode Android dérivé de la version sémantique, strictement croissant dans l'ordre
 * SemVer (préversions comprises) : MAJEURE×1 000 000 + MINEURE×10 000 + PATCH×100 + rang, où
 * rang = 99 pour une version finale et le numéro de préversion (0 à 98) sinon :
 * 1.2.0-beta.3 → 1 020 003 < 1.2.0 → 1 020 099. Usage CLI : tsx version-code.ts 1.2.0.
 */
import { parseSemver } from '../../src/update/semver';

/** Plafond Google Play. */
const MAX = 2_100_000_000;

export function versionCode(version: string): number {
  const v = parseSemver(version);
  if (!v) throw new Error(`Version invalide : ${version}`);
  if (v.minor > 99 || v.patch > 99) throw new Error(`Mineure et patch limitées à 99 : ${version}`);
  let rank = 99;
  if (v.pre.length > 0) {
    const n = v.pre.find((p): p is number => typeof p === 'number') ?? 0;
    if (n > 98) throw new Error(`Numéro de préversion limité à 98 : ${version}`);
    rank = n;
  }
  const code = v.major * 1_000_000 + v.minor * 10_000 + v.patch * 100 + rank;
  if (code < 1 || code > MAX) throw new Error(`versionCode hors limites : ${String(code)}`);
  return code;
}

if (process.argv[1]?.endsWith('version-code.ts')) {
  const arg = process.argv[2];
  if (!arg) throw new Error('Usage : tsx scripts/release/version-code.ts <version>');
  console.log(versionCode(arg));
}
