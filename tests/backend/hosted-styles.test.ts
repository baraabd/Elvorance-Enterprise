import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { hostedStyles, hostedStylePaths } from '../../tooling/scripts/hosted/styles.mts';

test('hosted server bundles retain application styles before Arabic and enterprise overrides', async () => {
  for (const role of ['admin', 'client', 'rep'] as const) {
    const paths = hostedStylePaths(role);
    assert.deepEqual(paths.slice(-2), [
      'packages/design-system/src/arabic-accessibility.css',
      'packages/design-system/src/enterprise.css',
    ]);
    if (role !== 'client')
      assert.equal(
        paths[0],
        `apps/${role === 'admin' ? 'admin-web' : 'rep-mobile'}/src/server/styles.css`,
      );
    const css = await hostedStyles(role, process.cwd());
    const expected = (await Promise.all(paths.map((path) => readFile(path, 'utf8'))))
      .join('\n')
      .replace(/@font-face\s*\{[^}]*\}/g, '');
    assert.equal(css, expected);
    assert.doesNotMatch(css, /@font-face/);
    assert.match(css, /\.rep-agreement-summary > \.row-between/);
    if (role === 'admin') assert.match(css, /\.admin-server \.admin-shell/);
  }
});
