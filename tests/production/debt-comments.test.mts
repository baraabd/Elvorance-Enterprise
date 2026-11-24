import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { workspace, roots } from '../../tooling/production/source.mts';
import { measureDebt } from '../../tooling/production/debt.mts';

for (const [label, source, count] of [
  ['template text', 'const x=1; const value=`head ${x} // @ts-nocheck\ntail`;', 0],
  ['regex and quoted text', 'const a=/@ts-ignore/; const b="/* @ts-expect-error */";', 0],
  [
    'real template expression comment',
    'const x=1; const value=`head ${/* @ts-ignore */ x} tail`;',
    1,
  ],
  ['real trailing comment', 'export const value=1; // @ts-ignore', 1],
] as const) {
  test(`debt parser distinguishes ${label} from suppression directives`, async (t) => {
    const root = await mkdtemp(resolve(tmpdir(), 'elvorance-debt-comments-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await Promise.all(roots.map((path) => mkdir(resolve(root, path), { recursive: true })));
    await writeFile(resolve(root, 'apps/example.ts'), source);
    assert.equal(measureDebt(await workspace(root)).items.length, count);
  });
}
