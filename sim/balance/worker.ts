/**
 * Processus de calcul lancé par pool.ts : joue les parties décrites en JSON (argv[2]) ou
 * simule des comptes entiers, et écrit un résultat JSON par ligne.
 */
import { simulateAccount, type AccountOptions } from './account';
import { playRun, type RunSetupSim } from './run';

type Job = (RunSetupSim & { tag: string }) | (AccountOptions & { tag: string; account: true });

const jobs = JSON.parse(process.argv[2] ?? '[]') as Job[];
for (const job of jobs) {
  if ('account' in job) {
    simulateAccount(job, (r) => {
      process.stdout.write(`${JSON.stringify({ tag: job.tag, ...r })}\n`);
    });
  } else {
    const { outcome } = playRun(job);
    process.stdout.write(`${JSON.stringify({ ...job, save: undefined, ...outcome })}\n`);
  }
}
