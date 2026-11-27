import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export function hostedStylePaths(role: 'admin' | 'client' | 'rep'): string[] {
  const base =
    role === 'admin'
      ? ['apps/admin-web/src/server/styles.css']
      : role === 'rep'
        ? ['apps/rep-mobile/src/server/styles.css']
        : ['styles', 'polish', 'tracking'].map((name) => `packages/design-system/src/${name}.css`);
  return [
    ...base,
    'packages/design-system/src/arabic-accessibility.css',
    'packages/design-system/src/enterprise.css',
  ];
}
export async function hostedStyles(
  role: 'admin' | 'client' | 'rep',
  sourceRoot = resolve(import.meta.dirname, '../../..'),
) {
  const css = (
    await Promise.all(
      hostedStylePaths(role).map((path) => readFile(resolve(sourceRoot, path), 'utf8')),
    )
  ).join('\n');
  // System fonts only; no embedded or copied font binaries in hosted builds.
  return css.replace(/@font-face\s*\{[^}]*\}/g, '');
}
