import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Locate the checkout even when this module is bundled into the test runner.
function sourceRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(resolve(directory, 'infra/environments/topology.mts'))) {
      return realpathSync(directory);
    }
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error('Environment tooling must run from its source checkout.');
    directory = parent;
  }
}

export const environmentSourceRoot = sourceRoot();

export function privateSecretPath(directory: string): string {
  const target = resolve(directory);
  const path = relative(environmentSourceRoot, target);
  if (
    !isAbsolute(directory) ||
    !(path === '..' || path.startsWith('..' + sep) || isAbsolute(path))
  ) {
    throw new Error('Choose an absolute secret directory outside the source checkout.');
  }
  // Checking only the lexical path lets an external symlink place credentials in
  // a tracked source directory. Reject links in every existing path component.
  let ancestor = parse(target).root;
  for (const component of target.slice(ancestor.length).split(sep)) {
    ancestor = resolve(ancestor, component);
    try {
      const details = lstatSync(ancestor);
      if (details.isSymbolicLink())
        throw new Error('Secret directory paths must not contain symbolic links.');
      if (!details.isDirectory())
        throw new Error('Secret directory ancestors must be directories.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}
