import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateAcceptance, verifyEvidence } from './acceptance.mts';
const [file, revision] = process.argv.slice(2);
if (!file || !revision)
  throw new Error('Usage: check-acceptance.mts <acceptance.json> <source-sha>');
const report = validateAcceptance(JSON.parse(await readFile(resolve(file), 'utf8')), revision);
await verifyEvidence(report, dirname(resolve(file)));
console.log(
  `Staging evidence validated for ${revision}. Production environment approval is still enforced by the release workflow.`,
);
