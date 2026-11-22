import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { json } from './source.mts';
import { provenance, listEvidence, stageEvidence, type GateEvidence } from './evidence.mts';

const output = resolve('dist/full-ci/security');
mkdirSync(output, { recursive: true });
const blockers: string[] = [];
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const secretPatterns = [
  new RegExp('-----BEGIN (?:RSA |EC |OPENSSH )?' + 'PRIVATE KEY-----'),
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
];
const findings: { path: string; rule: number }[] = [];
for (const path of files) {
  if (/(^|\/)\.env$|\.(jks|keystore|p12|pfx)$/.test(path)) findings.push({ path, rule: 0 });
  if (
    !/\.(?:[mc]?tsx?|jsx?|json|ya?ml|md|sh|xml|plist|properties|gradle|swift|java)$/.test(path) ||
    !existsSync(path)
  )
    continue;
  const text = readFileSync(path, 'utf8');
  secretPatterns.forEach((pattern, index) => {
    if (pattern.test(text)) findings.push({ path, rule: index + 1 });
  });
}
writeFileSync(
  resolve(output, 'secret-scan.json'),
  json({
    scope: 'tracked source, high-confidence patterns only; not a comprehensive secret scanner',
    findings,
  }),
);
if (findings.length)
  blockers.push(`Potential committed secrets: ${findings.length}; see redacted file/rule results`);
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run security through npm run ci:security.');
const result = spawnSync(process.execPath, [npm, 'audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  timeout: 120_000,
});
writeFileSync(resolve(output, 'dependency-audit.json'), result.stdout || '{}');
let vulnerabilities: Record<string, number> | null = null;
try {
  const audit = JSON.parse(result.stdout) as {
    metadata?: { vulnerabilities?: Record<string, number> };
    error?: unknown;
  };
  vulnerabilities = audit.metadata?.vulnerabilities ?? null;
  if (audit.error || !vulnerabilities || result.error || result.status === null)
    blockers.push('Dependency advisory service unavailable or audit incomplete');
  else if ((vulnerabilities.high ?? 0) + (vulnerabilities.critical ?? 0) > 0)
    blockers.push('High/critical dependency advisories require resolution');
} catch {
  blockers.push('Dependency audit did not produce valid JSON');
}
const report: GateEvidence = {
  schemaVersion: 1,
  ...provenance(),
  gate: 'security',
  status: blockers.length ? 'BLOCKED' : 'PASS',
  blockers,
  metrics: [
    {
      name: 'dependency-and-source-scans',
      totals: null,
      facts: {
        vulnerabilities,
        secretFindings: findings.length,
        limitations: 'Not DAST, penetration testing or proof of zero vulnerabilities',
      },
    },
  ],
  files: listEvidence(process.cwd(), [
    'dist/full-ci/security/secret-scan.json',
    'dist/full-ci/security/dependency-audit.json',
  ]),
};
writeFileSync(resolve(output, 'evidence.json'), json(report));
stageEvidence(report);
console.log(json({ status: report.status, blockers, vulnerabilities }));
if (report.status !== 'PASS') process.exitCode = 1;
