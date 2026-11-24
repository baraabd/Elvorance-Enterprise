import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  describeWith,
  installEnterpriseUx,
  isolatedText,
  statePanel,
} from '../src/enterprise-ux.ts';
const { JSDOM } = createRequire(import.meta.url)('jsdom') as typeof import('jsdom');
function required<T>(value: T | null | undefined): T {
  assert.ok(value != null);
  return value;
}
function surface(t: TestContext, html: string) {
  const dom = new JSDOM(`<div id="app">${html}</div>`, {
    url: 'https://ux.test/#home',
    pretendToBeVisual: true,
  });
  const names = [
    'window',
    'document',
    'location',
    'navigator',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'HTMLFormElement',
    'AbortController',
    'MutationObserver',
  ] as const;
  const previous = names.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  for (const name of names)
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  const root = dom.window.document.getElementById('app');
  assert.ok(root);
  t.after(() => {
    dom.window.close();
    for (const [name, value] of previous) {
      if (value) Object.defineProperty(globalThis, name, value);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  return { dom, root };
}
test('enterprise fields link existing hints without losing descriptions or values', (t) => {
  const { root } = surface(
    t,
    '<main><form><label><span>البريد</span><input type="email" value="name@example.test" aria-describedby="existing"><small>عنوان العمل</small></label></form></main>',
  );
  const dispose = installEnterpriseUx(root, { mode: 'demo' });
  const input = root.querySelector('input');
  assert.ok(input);
  assert.equal(input.dir, 'ltr');
  assert.equal(input.value, 'name@example.test');
  assert.ok(input.getAttribute('aria-describedby')?.includes('existing'));
  assert.ok(
    input.getAttribute('aria-describedby')?.includes(required(root.querySelector('small')).id),
  );
  describeWith(input, required(root.querySelector('small')).id);
  assert.equal(required(input.getAttribute('aria-describedby')).split(' ').length, 2);
  dispose();
});
test('invalid fields expose Arabic errors and clear only their own references', (t) => {
  const { root, dom } = surface(
    t,
    '<main><form><label><span>الاسم</span><input name="name" required aria-describedby="hint"><small id="hint">اسم المنشأة</small></label><button>حفظ</button></form></main>',
  );
  const dispose = installEnterpriseUx(root, { mode: 'demo' });
  const input = root.querySelector('input');
  assert.ok(input);
  assert.equal(input.checkValidity(), false);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.match(required(root.querySelector('.elv-field-error')).textContent ?? '', /مطلوب/);
  assert.ok(root.querySelector('.elv-error-summary a'));
  input.value = 'مؤسسة Atlas 123';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(input.getAttribute('aria-invalid'), null);
  assert.equal(input.getAttribute('aria-describedby'), 'hint');
  assert.equal(root.querySelector('.elv-error-summary'), null);
  dispose();
});
test('mixed content is text, not markup, and explicit direction is honored', (t) => {
  const { root } = surface(
    t,
    '<main><label>الوصف<textarea dir="rtl">ABC 123 العربية</textarea></label></main>',
  );
  const dispose = installEnterpriseUx(root, { mode: 'demo' });
  assert.equal(required(root.querySelector('textarea')).dir, 'rtl');
  const bdi = isolatedText('<img onerror="alert(1)">');
  assert.equal(bdi.tagName, 'BDI');
  assert.equal(bdi.children.length, 0);
  assert.match(bdi.textContent ?? '', /<img/);
  dispose();
});
test('reinstallation does not duplicate secondary navigation or skip links', (t) => {
  const { root } = surface(
    t,
    '<aside class="sidebar"><nav class="side-nav"></nav></aside><main>content</main>',
  );
  const options = {
    mode: 'demo' as const,
    groups: [{ label: 'العملاء', items: [{ route: 'clients', label: 'العملاء' }] }],
  };
  installEnterpriseUx(root, options);
  const dispose = installEnterpriseUx(root, options);
  assert.equal(root.querySelectorAll('.elv-secondary-nav').length, 1);
  assert.equal(root.querySelectorAll('.skip-link').length, 1);
  dispose();
  assert.equal(root.querySelector('.elv-secondary-nav'), null);
});
test('same-route renders do not steal focus while navigation focuses main', (t) => {
  const { root, dom } = surface(t, '<main><h1>العملاء</h1><input aria-label="بحث"></main>');
  const dispose = installEnterpriseUx(root, { mode: 'demo' });
  const input = root.querySelector('input');
  assert.ok(input);
  input.focus();
  dom.window.dispatchEvent(new dom.window.CustomEvent('elvorance:render'));
  assert.equal(document.activeElement, input);
  dom.window.location.hash = '#clients';
  dom.window.dispatchEvent(new dom.window.CustomEvent('elvorance:render'));
  assert.equal(document.activeElement, root.querySelector('main'));
  dispose();
});
test('state semantics distinguish errors from status without HTML injection', (t) => {
  const { root } = surface(
    t,
    '<main><div class="rep-live-timer" aria-label="المدة المنقضية">00:20:00</div></main>',
  );
  const dispose = installEnterpriseUx(root, { mode: 'demo' });
  const timer = required(root.querySelector('.rep-live-timer'));
  assert.equal(timer.getAttribute('role'), 'timer');
  assert.equal(timer.getAttribute('aria-live'), 'off');
  dispose();
  for (const state of ['loading', 'empty', 'success', 'offline'] as const)
    assert.equal(statePanel(state, 'النص').getAttribute('role'), 'status');
  const error = statePanel('error', '<script>');
  assert.equal(error.getAttribute('role'), 'alert');
  assert.equal(error.children.length, 0);
});
test('live offline feedback does not submit or pretend to synchronize drafts', (t) => {
  const { root, dom } = surface(t, '<main><form><input value="draft"></form></main>');
  let submissions = 0;
  root.addEventListener('submit', () => submissions++);
  const dispose = installEnterpriseUx(root, { mode: 'server' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  dom.window.dispatchEvent(new dom.window.Event('offline'));
  assert.match(required(root.querySelector('.elv-network-notice')).textContent ?? '', /لا تؤكد/);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  dom.window.dispatchEvent(new dom.window.Event('online'));
  assert.equal(submissions, 0);
  assert.equal(required(root.querySelector('input')).value, 'draft');
  assert.match(required(root.querySelector('.elv-network-notice')).textContent ?? '', /لا تُعاد/);
  dispose();
});
