import { mkdtemp, rm, readdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

export interface RuntimeRoute {
  service: string;
  method: string;
  path: string;
  automaticHead: boolean;
}
export interface RuntimeUi {
  app: string;
  routes: string[];
  actions: string[];
}
export interface LiveSection {
  app: string;
  role: string;
  name: string;
  endpoint: string[];
}
export interface RuntimeCensus {
  http: RuntimeRoute[];
  demo: RuntimeUi[];
  live: LiveSection[];
}

const apps = [
  ['admin', 'admin-web'],
  ['client', 'client-mobile'],
  ['rep', 'rep-mobile'],
] as const;
/** Loads registrations with isolated in-memory ports. Never starts listeners, brokers or real requests. */
export async function runtimeCensus(root: string): Promise<RuntimeCensus> {
  // Bundle inside the workspace so external modules resolve in both CI and local source packages.
  const services = (await readdir(resolve(root, 'services'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== 'api-gateway')
    .map((entry) => entry.name)
    .sort();
  for (const service of services)
    await access(resolve(root, `services/${service}/src/infrastructure/migrations/001_initial.ts`));
  const temporary = await mkdtemp(resolve(root, '.s01-census-'));
  try {
    const imports = services
      .map(
        (service, index) =>
          `import {createApp as app${index}} from './services/${service}/src/app.ts';\nimport {tables as tables${index}} from './services/${service}/src/infrastructure/migrations/001_initial.ts';`,
      )
      .join('\n');
    const contents = `${imports}
import {createApp as gateway} from './services/api-gateway/src/app.ts';
import {MemoryRepository} from './packages/service-kit/src/memory-repository.ts';
import {createLiveDataApi} from './packages/api-client/src/live-data.ts';
import {sectionsForRole} from './packages/api-client/src/live-workspace.ts';
const http=[]; globalThis.__s01Capture=(method,path)=>http.push({service:globalThis.__s01Service,method,path,automaticHead:method==='HEAD'});
const auth=async()=>{throw new Error('Inventory must not authenticate real requests')};
const customerDirectory={getCustomer:async()=>{throw new Error('Inventory must not access CRM')}};
for(const [service,create,tables] of [${services.map((s, i) => `['${s}',app${i},tables${i}]`).join(',')}]) {
 globalThis.__s01Service=service;
 const app=create({repository:new MemoryRepository(service,tables),auth,customerDirectory});
 await app.ready(); await app.close();
}
globalThis.__s01Service='api-gateway';
const gatewayApp=gateway({auth,upstreams:Object.fromEntries(${JSON.stringify(services)}.map(s=>[s,'http://127.0.0.1:1'])),fetcher:async()=>{throw new Error('Inventory network forbidden')}});
await gatewayApp.ready(); await gatewayApp.close();
const live=[];
for(const [role,app] of ${JSON.stringify(apps)}) {
 let endpoints=[];
 const api=createLiveDataApi({baseUrl:'https://inventory.invalid',accessToken:async()=>'synthetic-inventory-only',fetch:async(url)=>{
   const parsed=new URL(url);if(parsed.origin!=='https://inventory.invalid')throw new Error('Inventory origin escaped');
   endpoints.push(parsed.pathname);return new Response(JSON.stringify({items:[],nextCursor:null}),{status:200,headers:{'content-type':'application/json'}});
 }});
 for(const section of sectionsForRole(role,api)){endpoints=[];await section.load();live.push({app,role,name:section.id,endpoint:[...new Set(endpoints)].sort()})}
}
delete globalThis.__s01Capture; delete globalThis.__s01Service;
export default {http,live};`;
    const outfile = join(temporary, 'backend.mjs');
    await build({
      stdin: { contents, resolveDir: root, sourcefile: 's01-runtime-census.mjs' },
      outfile,
      absWorkingDir: root,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      external: ['pg-native'],
      logLevel: 'silent',
      banner: {
        js: "import {createRequire as __createRequire} from 'node:module'; const require=__createRequire(import.meta.url);",
      },
      plugins: [
        {
          name: 'observe-fastify-registrations',
          setup(builder) {
            builder.onResolve({ filter: /^fastify$/ }, () => ({
              path: 'fastify',
              namespace: 's01-census',
            }));
            builder.onLoad({ filter: /.*/, namespace: 's01-census' }, () => ({
              loader: 'js',
              resolveDir: root,
              contents: `import Fastify from ${JSON.stringify(resolve(root, 'node_modules/fastify/fastify.js'))};
export default function(options){const app=Fastify(options);app.addHook('onRoute',r=>{for(const method of [r.method].flat())globalThis.__s01Capture(method,r.url)});return app}`,
            }));
          },
        },
      ],
    });
    const loaded = (await import(pathToFileURL(outfile).href)) as {
      default: Pick<RuntimeCensus, 'http' | 'live'>;
    };
    const demo: RuntimeUi[] = [];
    for (const [id, app] of apps) {
      const result = await build({
        stdin: {
          contents: `import {installRuntime} from './packages/app-runtime/src/index.ts';import {registerApp} from './apps/${app}/src/app.ts';const app=registerApp(installRuntime());window.__s01Definition={routes:Object.keys(app.routes),actions:Object.keys(app.actions)};`,
          resolveDir: root,
          sourcefile: 's01-demo-census.js',
        },
        absWorkingDir: root,
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        target: 'es2022',
        logLevel: 'silent',
      });
      const console = new VirtualConsole();
      const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
        url: `https://inventory.invalid/${id}/`,
        runScripts: 'outside-only',
        virtualConsole: console,
      });
      try {
        dom.window.fetch = async () => {
          throw new Error('Inventory network forbidden');
        };
        const source = result.outputFiles[0]?.text;
        if (!source) throw new Error(`No inventory bundle for ${app}`);
        dom.window.eval(source);
        const value = Reflect.get(dom.window, '__s01Definition') as
          | { routes: string[]; actions: string[] }
          | undefined;
        if (!value) throw new Error(`No runtime definition for ${app}`);
        demo.push({ app, routes: [...value.routes].sort(), actions: [...value.actions].sort() });
      } finally {
        dom.window.close();
      }
    }
    return {
      http: loaded.default.http.sort((a, b) =>
        `${a.service} ${a.path} ${a.method}`.localeCompare(
          `${b.service} ${b.path} ${b.method}`,
          'en',
        ),
      ),
      demo,
      live: loaded.default.live,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
