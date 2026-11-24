import { build, type Plugin } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { RuntimeRegistration } from './model.mts';
import type { Workspace } from './source.mts';

async function aliases(ws: Workspace): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const path of ws.files.filter((path) => /^packages\/[^/]+\/package\.json$/.test(path))) {
    const manifest = JSON.parse(await readFile(resolve(ws.root, path), 'utf8')) as {
      name: string;
      exports?: string | Record<string, unknown>;
    };
    const exports =
      typeof manifest.exports === 'string' ? { '.': manifest.exports } : (manifest.exports ?? {});
    for (const [key, target] of Object.entries(exports))
      if (typeof target === 'string' && !key.includes('*'))
        result[manifest.name + (key === '.' ? '' : key.slice(1))] = resolve(
          ws.root,
          path,
          '..',
          target,
        );
  }
  return result;
}
function validate(value: unknown): RuntimeRegistration[] {
  if (!Array.isArray(value)) throw new Error('Registration probe must return an array');
  return value.map((row: unknown) => {
    if (
      typeof row !== 'object' ||
      !row ||
      !('owner' in row) ||
      !('mode' in row) ||
      !('kind' in row) ||
      !('key' in row) ||
      typeof row.owner !== 'string' ||
      typeof row.mode !== 'string' ||
      typeof row.key !== 'string' ||
      !['route', 'action', 'api-route'].includes(String(row.kind))
    )
      throw new Error('Malformed runtime registration');
    return row as RuntimeRegistration;
  });
}
/** Execute registrations in disposable JSDOM/Fastify fixtures. No ports, databases, brokers or credentials are used. */
export async function runtimeRegistrations(ws: Workspace): Promise<RuntimeRegistration[]> {
  const exports = await aliases(ws);
  const local: Plugin = {
    name: 'workspace-exports',
    setup(builder) {
      builder.onResolve({ filter: /^@elvorance\// }, (args) => {
        const path = exports[args.path];
        return path ? { path } : undefined;
      });
    },
  };
  const services = ws.files
    .flatMap((path) => /^services\/([^/]+)\/src\/app\.ts$/.exec(path)?.[1] ?? [])
    .sort();
  const apps = ws.files
    .flatMap((path) => /^apps\/([^/]+)\/src\/app\.ts$/.exec(path)?.[1] ?? [])
    .sort();
  const output: RuntimeRegistration[] = [];
  const directory = resolve(ws.root, 'dist/production/discovery');
  await mkdir(directory, { recursive: true });
  const run = async (name: string, code: string, plugins: Plugin[] = []): Promise<unknown> => {
    const outfile = resolve(directory, `${name}.mjs`);
    await build({
      stdin: { contents: code, resolveDir: ws.root, sourcefile: `inventory-${name}.mjs` },
      outfile,
      platform: 'node',
      format: 'esm',
      bundle: true,
      packages: 'external',
      target: 'node24',
      plugins: [...plugins, local],
      logLevel: 'silent',
    });
    const result = spawnSync(process.execPath, [outfile], {
      cwd: ws.root,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.status !== 0)
      throw new Error(
        `Registration probe ${name} failed: ${result.stderr || result.error?.message}`,
      );
    return JSON.parse(result.stdout) as unknown;
  };
  // Compile browser registrations, but never start/render the applications or open network connections.
  for (const folder of apps) {
    const role = folder.split('-')[0];
    const bundle = await build({
      stdin: {
        contents: `import {installRuntime} from './packages/app-runtime/src/index.ts'; import {registerApp} from './apps/${folder}/src/app.ts'; const d=registerApp(installRuntime()); window.__inventory={routes:Object.keys(d.routes).sort(),actions:Object.keys(d.actions).sort()};`,
        resolveDir: ws.root,
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      plugins: [local],
      logLevel: 'silent',
    });
    const text = bundle.outputFiles?.[0]?.text;
    if (!text) throw new Error(`No browser bundle for ${folder}`);
    const code = `import {JSDOM,VirtualConsole} from 'jsdom'; const errors=[]; const vc=new VirtualConsole(); vc.on('jsdomError',e=>errors.push(e.message)); const dom=new JSDOM('<div id="app"></div>',{url:'https://inventory.invalid/',runScripts:'outside-only',virtualConsole:vc}); try {dom.window.fetch=()=>{throw new Error('Network forbidden in inventory')};dom.window.structuredClone=structuredClone;dom.window.eval(${JSON.stringify(text)});if(errors.length)throw new Error(errors.join(';'));const d=dom.window.__inventory;console.log(JSON.stringify([...d.routes.map(key=>({owner:${JSON.stringify(role)},mode:'demo',kind:'route',key})),...d.actions.map(key=>({owner:${JSON.stringify(role)},mode:'demo',kind:'action',key}))]));} finally {dom.window.close();}`;
    output.push(...validate(await run(`demo-${folder}`, code)));
  }
  const fake = `const fake=new Proxy(function(){throw new Error('Inventory must not call an API')},{get(){return fake;}});`;
  const live = `import {sectionsForRole} from './packages/api-client/src/live-workspace.ts';import {adminRouteTargets} from './apps/admin-web/src/server/workspace.ts';${fake}console.log(JSON.stringify([...sectionsForRole('client',fake).map(x=>({owner:'client',mode:'server',kind:'route',key:x.id})),...Object.keys(adminRouteTargets).map(key=>({owner:'admin',mode:'server',kind:'route',key}))]));`;
  output.push(...validate(await run('live-sections', live)));
  const fastifyUrl = pathToFileURL(
    createRequire(resolve(ws.root, 'package.json')).resolve('fastify'),
  ).href;
  const observer: Plugin = {
    name: 'observe-real-fastify-registration',
    setup(builder) {
      builder.onResolve({ filter: /^fastify$/ }, () => ({
        path: 'observed-fastify',
        namespace: 'inventory',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'inventory' }, () => ({
        contents: `import original, {LogController} from ${JSON.stringify(fastifyUrl)};export {LogController};export default function(options){const owner=globalThis.__inventoryOwner;const app=original(options);app.addHook('onRoute',r=>{for(const method of Array.isArray(r.method)?r.method:[r.method])globalThis.__inventoryRoutes.push({owner,mode:'backend',kind:'api-route',key:method+' '+r.url,method,path:r.url,automatic:method==='HEAD'});});return app;}`,
        resolveDir: ws.root,
      }));
      // File URLs preserve Windows drive letters/backslashes without bundling CommonJS internals.
      builder.onResolve({ filter: /^file:\/\// }, (args) =>
        args.path === fastifyUrl ? { path: args.path, external: true } : undefined,
      );
    },
  };
  const imports = services
    .map(
      (service, index) =>
        `import {createApp as app${index}} from './services/${service}/src/app.ts';` +
        (service === 'api-gateway'
          ? ''
          : `import {tables as tables${index}} from './services/${service}/src/infrastructure/migrations/001_initial.ts';`),
    )
    .join('\n');
  const invoke = services
    .map(
      (service, index) =>
        `globalThis.__inventoryOwner=${JSON.stringify(service)};{const app=app${index}(${service === 'api-gateway' ? `{auth,upstreams:Object.fromEntries(${JSON.stringify(services.filter((x) => x !== 'api-gateway'))}.map(x=>[x,'https://'+x+'.invalid'])),fetcher:async()=>{throw new Error('Network forbidden')}}` : `{auth,repository:new MemoryRepository(${JSON.stringify(service)},tables${index}),customerDirectory:{async getCustomer(){throw new Error('Inventory cannot request customer data')}}}`});await app.ready();await app.close();}`,
    )
    .join('\n');
  const code = `${imports}\nimport {MemoryRepository} from './packages/service-kit/src/memory-repository.ts';globalThis.__inventoryRoutes=[];globalThis.fetch=async()=>{throw new Error('Network forbidden in inventory')};const auth=async()=>{throw new Error('Inventory does not authenticate requests')};${invoke}\nconsole.log(JSON.stringify(globalThis.__inventoryRoutes));`;
  output.push(...validate(await run('services', code, [observer])));
  const keys = new Set<string>();
  for (const entry of output) {
    const key = [entry.owner, entry.mode, entry.kind, entry.key].join(':');
    if (keys.has(key)) throw new Error(`Duplicate runtime registration: ${key}`);
    keys.add(key);
  }
  return output.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
}
