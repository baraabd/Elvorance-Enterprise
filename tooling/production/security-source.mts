import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { git, hash } from './evidence.mts';
const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
const findings: Array<{ path: string; rule: string }> = [];
for (const path of files) {
  if (/\.(?:png|jpe?g|gif|woff2?|ttf|zip|jar|pdf)$/.test(path)) continue;
  const text = await readFile(path, 'utf8');
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]{80,}\s+-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
      text,
    )
  )
    findings.push({ path, rule: 'materialized-private-key' });
  if (/(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/.test(text))
    findings.push({ path, rule: 'github-token-format' });
  if (/AKIA[0-9A-Z]{16}/.test(text)) findings.push({ path, rule: 'aws-access-key-format' });
}
await mkdir('dist/security', { recursive: true });
const report = {
  schemaVersion: 1,
  status: findings.length ? 'BLOCKED' : 'PASS',
  sourceSha: git(['rev-parse', 'HEAD']),
  files: files.length,
  lockSha256: hash(await readFile('package-lock.json')),
  findings,
  scope:
    'Narrow materialized-secret pattern check only. This is not comprehensive SAST, DAST, credential validation, security certification or a zero-vulnerability claim.',
};
await writeFile('dist/security/source-scan.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (findings.length) process.exitCode = 1;
