import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as esbuild from 'esbuild';

process.env.TZ = 'UTC';
export const directory = path.dirname(fileURLToPath(import.meta.url));
export const workspace = path.resolve(directory, '../..');
export const clock = '2027-02-10T12:00:00.000Z';
export const randomSeed = 20270110;
export const storeKey = 'atlas.crm.2027.v1';
export const appNames = { rep: 'rep-mobile', client: 'client-mobile', admin: 'admin-web' };
export const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const canonicalAppCss = (text) =>
  text
    .replace(/^<style>/, '')
    .replace(/<\/style>$/, '')
    .trim();

export function createSurface({
  app = 'rep',
  route = 'home',
  params = {},
  state,
  fixedClock = clock,
  fixedSeed = randomSeed,
} = {}) {
  const logs = [],
    requests = [],
    virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => logs.push({ type: 'jsdom', message: String(error) }));
  virtualConsole.on('error', (...args) =>
    logs.push({ type: 'console', message: args.map(String).join(' ') }),
  );
  virtualConsole.on('warn', (...args) =>
    logs.push({ type: 'warning', message: args.map(String).join(' ') }),
  );
  const query = new URLSearchParams(params).toString();
  const dom = new JSDOM(
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body><div id="app"></div></body></html>',
    {
      url: `https://atlas-parity.test/${app}/#${route}${query ? '?' + query : ''}`,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole,
    },
  );
  const w = dom.window,
    NativeDate = w.Date,
    stamp = NativeDate.parse(fixedClock);
  class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [stamp]));
    }
    static now() {
      return stamp;
    }
  }
  w.Date = FixedDate;
  let sequence = fixedSeed >>> 0;
  w.Math.random = () => {
    sequence = (Math.imul(sequence, 1664525) + 1013904223) >>> 0;
    return sequence / 0x100000000;
  };
  w.scrollTo = () => {};
  // Render tracking controls and the empty team state without contacting a server.
  // GPS remains unrequested; every request below must match a read-only fixture.
  w.fetch = async (url, options = {}) => {
    const target = String(url);
    requests.push({ url: target, method: options.method || 'GET' });
    if ((options.method || 'GET') !== 'GET')
      throw new Error('Unexpected mutation during design parity: ' + target);
    if (target === '/api/tracking/status')
      return {
        ok: true,
        status: 200,
        json: async () => ({ available: true, staleAfterMs: 45000 }),
      };
    if (target === '/api/tracking/locations')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          available: true,
          locations: [],
          serverNow: fixedClock,
          staleAfterMs: 45000,
        }),
      };
    throw new Error('No network fixture for ' + target);
  };
  if (state) w.localStorage.setItem(storeKey, JSON.stringify(state));
  return { dom, w, logs, requests, close: () => w.close() };
}

export function executeScript(surface, source, label) {
  const script = surface.w.document.createElement('script');
  script.dataset.paritySource = label;
  script.textContent = source;
  surface.w.document.head.append(script);
}

export async function settle(surface) {
  // DOMContentLoaded and the deterministic tracking read promises must settle.
  await new Promise((resolve) => surface.w.setTimeout(resolve, 0));
  await new Promise((resolve) => surface.w.setTimeout(resolve, 0));
}

export function snapshot(surface) {
  const { w } = surface,
    app = w.document.getElementById('app');
  if (!app || !app.textContent.trim()) throw new Error('Application rendered no content.');
  if (app.textContent.includes('تعذر عرض هذه الصفحة'))
    throw new Error('Application rendered its error fallback.');
  const copy = app.cloneNode(true);
  copy.querySelectorAll('style').forEach((style) => style.remove());
  // No text, IDs, classes, data attributes, input values or SVG data is removed.
  return {
    title: w.document.title,
    html: copy.innerHTML,
    iconsHash: hash(JSON.stringify(w.AtlasIcons || {})),
  };
}

export function applyFixture(seedState, fixture = {}) {
  const state = clone(seedState);
  for (const [collection, updates] of Object.entries(fixture)) {
    if (!Array.isArray(state[collection]))
      throw new Error('Unknown fixture collection: ' + collection);
    for (const [id, patch] of Object.entries(updates)) {
      const record = state[collection].find((row) => row.id === id);
      if (!record) throw new Error(`Missing fixture record: ${collection}/${id}`);
      Object.assign(record, clone(patch));
    }
  }
  return state;
}

export async function bundleApps() {
  const output = {};
  await Promise.all(
    Object.entries(appNames).map(async ([app, folder]) => {
      const source = `import { installRuntime } from '@atlas/app-runtime';\nimport { installSiteTracking } from '@atlas/app-runtime/tracking';\nimport { registerApp } from './apps/${folder}/src/app.js';\nconst runtime = installRuntime();\nwindow.AtlasParityDefinition = registerApp(runtime);\ninstallSiteTracking({ runtime, disabled: false });\nruntime.start(${JSON.stringify(app)});`;
      const result = await esbuild.build({
        stdin: { contents: source, resolveDir: workspace, sourcefile: `${app}-parity-entry.js` },
        absWorkingDir: workspace,
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        target: 'es2022',
        logLevel: 'silent',
      });
      output[app] = result.outputFiles[0].text;
    }),
  );
  return output;
}

export async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}
export async function writeJson(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, JSON.stringify(value, null, 2) + '\n');
}
export function firstDifference(expected, actual) {
  let index = 0;
  while (index < expected.length && index < actual.length && expected[index] === actual[index])
    index++;
  return {
    index,
    expectedLength: expected.length,
    actualLength: actual.length,
    expected: expected.slice(Math.max(0, index - 160), index + 260),
    actual: actual.slice(Math.max(0, index - 160), index + 260),
  };
}
