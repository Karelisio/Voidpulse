/**
 * Simulateur d'équilibrage (headless) : le bot joue des parties avec le code du jeu et le
 * rapport trace les courbes utiles aux réglages.
 *
 *   npm run balance -- stages   [--runs 12] [--skill 0.6]    survie, victoires, DPS par stage
 *   npm run balance -- accounts [--accounts 4] [--runs 80]    progression de comptes complets
 *
 * Résultats : sim/out/balance-<type>.jsonl et sim/out/balance.html (courbes SVG). Cibles :
 * 1re victoire du stage 1 en ~5 parties, un déblocage toutes les 1-2 parties au début,
 * progression visible au-delà de 100 h (niveau de compte, talents, Ascension, Paragon).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { CAMPAIGN } from '../../src/content/data';
import { runPool, type Job } from './pool';
import { renderReport, type Series } from './report';
import type { RunRecordSim } from './account';
import type { RunOutcome } from './run';

const OUT = path.join(import.meta.dirname, '..', 'out');
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    runs: { type: 'string' },
    skill: { type: 'string', default: '0.6' },
    accounts: { type: 'string', default: '4' },
  },
});
const kind = positionals[0] ?? 'stages';
mkdirSync(OUT, { recursive: true });

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

async function stages(): Promise<void> {
  const runs = Number(opt.runs ?? 12);
  const skill = Number(opt.skill);
  const jobs: Job[] = CAMPAIGN.flatMap((s) =>
    Array.from({ length: runs }, (_, i) => ({
      tag: s.id,
      stage: s.id,
      character: 'vex',
      skill,
      seed: `stage-${s.id}-${String(i)}`,
      maxSeconds: 960,
    })),
  );
  const res = (await runPool(jobs)) as (Job & RunOutcome)[];
  writeFileSync(
    path.join(OUT, 'balance-stages.jsonl'),
    res.map((r) => JSON.stringify(r)).join('\n'),
  );
  const survival: Series[] = [];
  const rows = CAMPAIGN.map((s, i) => {
    const r = res.filter((x) => x.tag === s.id);
    const times = r.map((x) => x.time).sort((a, b) => a - b);
    // Courbe de survie : part des parties encore en vie à chaque minute.
    survival.push({
      name: s.name,
      points: Array.from({ length: 16 }, (_, m) => [
        m,
        r.filter((x) => x.victory || x.time >= m * 60).length / r.length,
      ]),
    });
    return {
      stage: `${String(i + 1)}. ${s.name}`,
      victoires: `${String(r.filter((x) => x.victory).length)}/${String(r.length)}`,
      'survie médiane (s)': Math.round(median(times)),
      'niveau moyen': Math.round(r.reduce((a, x) => a + x.level, 0) / r.length),
      'DPS moyen': Math.round(r.reduce((a, x) => a + x.dps, 0) / r.length),
    };
  });
  console.table(rows);
  writeFileSync(
    path.join(OUT, 'balance.html'),
    renderReport(`Stages sans méta (habileté ${String(skill)})`, rows, [
      {
        title: 'Survie (part des parties encore en cours, par minute)',
        xLabel: 'minutes',
        series: survival,
      },
    ]),
  );
}

async function accounts(): Promise<void> {
  const runs = Number(opt.runs ?? 80);
  const n = Number(opt.accounts);
  const jobs: Job[] = Array.from({ length: n }, (_, i) => ({
    tag: `compte ${String(i + 1)}`,
    account: true,
    seed: `account-${String(i)}`,
    runs,
    skillStart: 0.4,
    skillMax: 0.75,
    learnRuns: 15,
  }));
  const res = (await runPool(jobs, (r) => {
    const x = r as RunRecordSim & { tag: string };
    if (x.index % 10 === 0)
      console.log(`${x.tag} : ${String(x.index)} parties, ${x.hours.toFixed(1)} h`);
  })) as (RunRecordSim & { tag: string })[];
  writeFileSync(
    path.join(OUT, 'balance-accounts.jsonl'),
    res.map((r) => JSON.stringify(r)).join('\n'),
  );
  const by = (tag: string) => res.filter((r) => r.tag === tag).sort((a, b) => a.index - b.index);
  const tags = [...new Set(res.map((r) => r.tag))];
  const rows = tags.map((tag) => {
    const rs = by(tag);
    const first = (stage: string) => rs.find((r) => r.victory && r.stage === stage)?.index ?? '—';
    const early = rs.slice(0, 20);
    const unlocks = early.filter(
      (r) =>
        r.gains.characters +
          r.gains.stages +
          r.gains.relics +
          r.gains.accountLevels +
          r.gains.talents >
        0,
    ).length;
    const last = rs[rs.length - 1];
    return {
      compte: tag,
      heures: Number(last.hours.toFixed(1)),
      '1re victoire stage 1': first(CAMPAIGN[0].id),
      'campagne finie (partie)': first(CAMPAIGN[CAMPAIGN.length - 1].id),
      'parties à déblocage (20 premières)': `${String(unlocks)}/20`,
      'niveau de compte': last.accountLevel,
      'rangs de talents': last.talentRanks,
    };
  });
  console.table(rows);
  const curve = (f: (r: RunRecordSim) => number): Series[] =>
    tags.map((tag) => ({ name: tag, points: by(tag).map((r) => [r.hours, f(r)]) }));
  writeFileSync(
    path.join(OUT, 'balance.html'),
    renderReport('Progression de comptes simulés', rows, [
      {
        title: 'Stages de campagne terminés',
        xLabel: 'heures de jeu',
        series: curve((r) => r.cleared),
      },
      { title: 'Niveau de compte', xLabel: 'heures de jeu', series: curve((r) => r.accountLevel) },
      {
        title: 'Rangs de talents achetés',
        xLabel: 'heures de jeu',
        series: curve((r) => r.talentRanks),
      },
      {
        title: 'Durée des parties (min)',
        xLabel: 'heures de jeu',
        series: curve((r) => r.time / 60),
      },
    ]),
  );
}

if (kind === 'stages') await stages();
else if (kind === 'accounts') await accounts();
else throw new Error(`Type inconnu : ${kind} (stages, accounts)`);
console.log(`Rapport : ${path.relative(process.cwd(), path.join(OUT, 'balance.html'))}`);
