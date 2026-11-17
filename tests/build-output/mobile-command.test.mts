// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runMobile } from '../../tooling/scripts/mobile.mts';

test('native sync does not copy partial or stale output after a failed build', async () => {
  let spawned = false;
  await assert.rejects(
    runMobile(['sync', 'rep-mobile', 'android'], {
      checkBuild: async () => {
        throw new Error('Build incomplete: run npm run build:apps.');
      },
      run: () => {
        spawned = true;
        return { status: 0 };
      },
    }),
    /Build incomplete/,
  );
  assert.equal(spawned, false);
});

test('native sync validates the selected app before invoking Capacitor', async () => {
  const sequence = [];
  await runMobile(['sync', 'client-mobile', 'android'], {
    checkBuild: async (folder) => sequence.push(`validated:${folder}`),
    run: (_exe, args, options) => {
      assert.deepEqual(args.slice(1), ['sync', 'android']);
      assert.match(options.cwd.replaceAll('\\', '/'), /apps\/client-mobile$/);
      sequence.push('copied');
      return { status: 0 };
    },
  });
  assert.deepEqual(sequence, ['validated:client-mobile', 'copied']);
});

test('native tooling reports spawn failures, nonzero exits and signals as failures', async () => {
  for (const result of [
    { error: new Error('spawn ENOENT'), status: null },
    { status: 1 },
    { status: null, signal: 'SIGTERM' },
  ]) {
    await assert.rejects(
      runMobile(['open', 'rep-mobile', 'android'], { run: () => result }),
      /ENOENT|exit 1|signal SIGTERM/,
    );
  }
});

test('native tooling requires an explicit mobile app and platform', async () => {
  for (const args of [['sync'], ['sync', 'rep-mobile'], ['sync', 'admin-web', 'android']]) {
    await assert.rejects(
      runMobile(args, {
        run: () => {
          assert.fail('Invalid arguments must not launch Capacitor.');
        },
      }),
      /Choose/,
    );
  }
});
