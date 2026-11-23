import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
];
const failures: string[] = [];
for (const path of execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)) {
  if (/\.(?:png|jpg|jpeg|webp|woff2?|ttf|ico|pdf|zip)$/.test(path)) continue;
  const bytes = await readFile(path);
  if (bytes.length > 2 * 1024 * 1024) continue;
  if (patterns.some((pattern) => pattern.test(bytes.toString('utf8')))) failures.push(path);
}
// Never print the matching secret, only affected repository paths. Heuristic scan is not a complete DLP guarantee.
if (failures.length) {
  console.error(JSON.stringify({ event: 'secret-pattern-rejected', paths: failures }));
  process.exitCode = 1;
} else console.log(JSON.stringify({ event: 'secret-pattern-scan', passed: true }));
