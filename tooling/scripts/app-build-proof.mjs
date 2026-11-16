import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { apps, root } from './workspace.mjs';

const manifestPath = 'dist/apps-build.json';
const schemaVersion = 1;
export const buildToolInputs = [
  'package.json',
  'package-lock.json',
  'tooling/scripts/workspace.mjs',
  'tooling/scripts/build-apps.mjs',
  'tooling/scripts/copy-content.mjs',
  'tooling/scripts/app-build-proof.mjs',
];

function containedPath(workspaceRoot, path) {
  const absolute = resolve(workspaceRoot, path);
  const fromRoot = relative(workspaceRoot, absolute);
  if (
    !fromRoot ||
    fromRoot === '..' ||
    fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`Build manifest contains a path outside the workspace: ${path}`);
  }
  return absolute;
}

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const requiredOutputs = (folder) =>
  ['index.html', 'config.js', 'assets/app.js', 'assets/app.css', 'assets/app.js.map'].map(
    (file) => `apps/${folder}/dist/${file}`,
  );

async function hashFiles(workspaceRoot, paths) {
  const hashes = {};
  for (const path of [...new Set(paths)].sort()) {
    const normalized = relative(workspaceRoot, containedPath(workspaceRoot, path)).replaceAll(
      '\\',
      '/',
    );
    hashes[normalized] = digest(await readFile(containedPath(workspaceRoot, normalized)));
  }
  return hashes;
}

/** Remove the previous success marker before attempting any part of a new app build. */
export async function invalidateAppBuilds({ workspaceRoot = root } = {}) {
  await rm(resolve(workspaceRoot, manifestPath), { force: true });
}

export async function recordAppBuild(folder, inputs, { workspaceRoot = root } = {}) {
  if (!apps.some((app) => app.folder === folder)) throw new Error(`Unknown application: ${folder}`);
  return {
    folder,
    inputs: await hashFiles(workspaceRoot, [...buildToolInputs, ...inputs]),
    outputs: await hashFiles(workspaceRoot, requiredOutputs(folder)),
  };
}

/** Called once, only after all apps, portable copies, launcher and documentation succeeded. */
export async function completeAppBuilds(records, { workspaceRoot = root } = {}) {
  if (
    records.length !== apps.length ||
    apps.some((app) => !records.some((entry) => entry.folder === app.folder))
  ) {
    throw new Error('Cannot complete a partial application build.');
  }
  await mkdir(resolve(workspaceRoot, 'dist'), { recursive: true });
  await writeFile(
    resolve(workspaceRoot, manifestPath),
    JSON.stringify(
      {
        schemaVersion,
        apps: Object.fromEntries(records.map(({ folder, ...record }) => [folder, record])),
      },
      null,
      2,
    ) + '\n',
  );
}

function buildRequired(folder, reason, cause) {
  const error = new Error(
    `${folder}: ${reason}. Run npm run build:apps successfully before mobile:sync; existing dist files may be incomplete or stale.`,
    cause ? { cause } : undefined,
  );
  error.code = 'ATLAS_BUILD_REQUIRED';
  return error;
}

/** Verify build completion, source freshness and runtime asset integrity before native sync. */
export async function assertAppBuild(folder, { workspaceRoot = root } = {}) {
  if (!apps.some((app) => app.folder === folder)) throw new Error(`Unknown application: ${folder}`);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(workspaceRoot, manifestPath), 'utf8'));
  } catch (cause) {
    throw buildRequired(folder, 'no readable complete application build was recorded', cause);
  }
  const record = manifest?.apps?.[folder];
  const requiredInputs = [
    ...buildToolInputs,
    `apps/${folder}/src/main.js`,
    `apps/${folder}/index.html`,
    `apps/${folder}/config.example.js`,
  ];
  if (
    manifest?.schemaVersion !== schemaVersion ||
    !record?.inputs ||
    !record?.outputs ||
    requiredInputs.some((path) => typeof record.inputs[path] !== 'string') ||
    requiredOutputs(folder).some((path) => typeof record.outputs[path] !== 'string')
  ) {
    throw buildRequired(folder, 'the application build record is incomplete or unsupported');
  }
  for (const [kind, files] of [
    ['source', record.inputs],
    ['output', record.outputs],
  ]) {
    for (const [path, expectedHash] of Object.entries(files)) {
      let actualHash;
      try {
        actualHash = digest(await readFile(containedPath(workspaceRoot, path)));
      } catch (cause) {
        throw buildRequired(folder, `${kind} file is unavailable: ${path}`, cause);
      }
      if (actualHash !== expectedHash)
        throw buildRequired(folder, `${kind} changed since the last successful build: ${path}`);
    }
  }
  return record;
}
