import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('representative release entrypoint compiles independently without legacy demo/runtime modules', async () => {
  const result = await build({
    absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)),
    entryPoints: ['apps/rep-mobile/src/server-main.ts'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    write: false,
    metafile: true,
    minify: true,
  });
  const files = Object.keys(result.metafile!.inputs);
  assert.ok(files.some((path) => path.includes('mobile-auth/src/oidc.ts')));
  assert.ok(files.some((path) => path.includes('server/views/quotes.ts')));
  assert.deepEqual(
    files.filter((path) =>
      /(?:demo-data|local-demo|app-runtime|live-workspace|\/features\/)/.test(path),
    ),
    [],
  );
  assert.ok(result.outputFiles[0]!.contents.length > 10000);
});
