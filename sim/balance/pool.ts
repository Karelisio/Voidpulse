/**
 * Exécution parallèle de parties simulées : un processus tsx par cœur, résultats agrégés.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import type { AccountOptions, RunRecordSim } from './account';
import type { RunSetupSim, RunOutcome } from './run';

export type RunJob = Omit<RunSetupSim, 'save'> & { tag: string };
export type AccountJob = AccountOptions & { tag: string; account: true };
export type Job = RunJob | AccountJob;
/** Une ligne de résultat : une partie isolée, ou une partie d'un compte simulé. */
export type JobResult = (RunJob & RunOutcome) | (RunRecordSim & { tag: string });

const WORKER = path.join(import.meta.dirname, 'worker.ts');
const TSX = path.join(import.meta.dirname, '..', '..', 'node_modules', '.bin', 'tsx');

export async function runPool(
  jobs: readonly Job[],
  onResult?: (r: JobResult) => void,
): Promise<JobResult[]> {
  const cores = Math.max(1, availableParallelism());
  const chunks: Job[][] = Array.from({ length: cores }, () => []);
  jobs.forEach((j, i) => chunks[i % cores].push(j));
  const results: JobResult[] = [];
  await Promise.all(
    chunks
      .filter((c) => c.length > 0)
      .map(
        (chunk) =>
          new Promise<void>((resolve, reject) => {
            const child = spawn(TSX, [WORKER, JSON.stringify(chunk)], {
              stdio: ['ignore', 'pipe', 'inherit'],
            });
            let buf = '';
            child.stdout.on('data', (d: Buffer) => {
              buf += d.toString();
              let nl = buf.indexOf('\n');
              while (nl >= 0) {
                const r = JSON.parse(buf.slice(0, nl)) as JobResult;
                results.push(r);
                onResult?.(r);
                buf = buf.slice(nl + 1);
                nl = buf.indexOf('\n');
              }
            });
            child.on('exit', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`worker : code ${String(code)}`));
            });
          }),
      ),
  );
  return results;
}
