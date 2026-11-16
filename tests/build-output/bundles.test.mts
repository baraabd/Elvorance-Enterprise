// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { root, apps } from '../../tooling/scripts/workspace.mts';

for (const app of apps) {
  test(`actual portable ${app.id} output starts without external assets`, async () => {
    const html = await readFile(resolve(root, `dist/${app.id}.html`), 'utf8');
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => errors.push(error.message));
    virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
    const dom = new JSDOM(html, {
      url: `https://elvorance-build.test/${app.id}.html`,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        window.scrollTo = () => {};
        window.structuredClone = globalThis.structuredClone;
      },
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(dom.window.document.documentElement.dataset.ready, 'true', `Runtime errors: ${errors.join(' | ')}`);
      assert.equal(dom.window.document.body.dataset.app, app.id);
      assert.equal(
        dom.window.document.querySelectorAll('script[src],link[rel="stylesheet"]').length,
        0,
      );
      assert.match(dom.window.document.querySelector('style').textContent, /system-ui/);
      assert.doesNotMatch(dom.window.document.querySelector('style').textContent, /__ATLAS_FONT_|__ELVORANCE_FONT_/);
      assert.ok(dom.window.document.querySelector('#main-content').textContent.trim().length > 100);
      assert.deepEqual(errors, []);
    } finally {
      dom.window.close();
    }
  });
}
