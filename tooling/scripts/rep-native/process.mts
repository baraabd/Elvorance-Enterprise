import { spawnSync } from 'node:child_process';
import { repositoryRoot } from '../rep-release/build-proof.mts';

export function run(command: string, args: string[], cwd = repositoryRoot): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with exit status ${result.status ?? 'unknown'}.`);
}

export function capture(command: string, args: string[], cwd = repositoryRoot): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed with exit status ${result.status ?? 'unknown'}.`);
  return result.stdout.trim();
}
