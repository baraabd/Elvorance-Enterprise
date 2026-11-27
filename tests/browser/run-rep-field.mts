import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

await mkdir('dist/browser', { recursive: true });
await build({
  entryPoints: ['tests/browser/rep-field-entry.ts'],
  outfile: 'dist/browser/app.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});
await build({
  entryPoints: ['tests/browser/rep-field-server.ts'],
  outfile: 'dist/browser/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['pg-native'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
const server = spawn(process.execPath, ['dist/browser/server.mjs'], {
  env: { ...process.env, ELVORANCE_SYNTHETIC_BROWSER: 'loopback-only' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stderr.on('data', (chunk: Buffer) => {
  serverLog += chunk.toString();
});
try {
  const origin = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Browser fixture readiness timed out.')),
      15_000,
    );
    server.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Fixture exited: ${code}`));
    });
    server.stdout.on('data', (chunk: Buffer) => {
      serverLog += chunk.toString();
      const match = /BROWSER_READY (\{[^\n]+\})/.exec(serverLog);
      const payload = match?.[1];
      if (payload) {
        clearTimeout(timer);
        const value = JSON.parse(payload) as { origin: string };
        if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(value.origin))
          reject(new Error('Non-loopback browser fixture.'));
        else resolve(value.origin);
      }
    });
  });
  const browser = spawn(process.env.PYTHON ?? 'python3', ['tests/browser/rep-field.py', origin], {
    stdio: 'inherit',
  });
  const code = await new Promise<number>((resolve, reject) => {
    browser.once('error', reject);
    browser.once('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error('Representative browser field journey failed.');
} finally {
  const stopped = new Promise<void>((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once('exit', () => resolve());
  });
  server.kill('SIGTERM');
  const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
  await stopped;
  clearTimeout(timeout);
  await writeFile('dist/browser/fixture.log', serverLog);
}
