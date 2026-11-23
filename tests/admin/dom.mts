/** Local DOM-only diagnostic adapter; never accepted as the required CI browser lane. */
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const { JSDOM, VirtualConsole } = createRequire(import.meta.url)('jsdom') as typeof import('jsdom');
export async function domDriver() {
  let dom: import('jsdom').JSDOM | null = null;
  function current() {
    if (!dom) throw new Error('No test document');
    return dom;
  }
  async function close() {
    if (dom) {
      dom.window.dispatchEvent(new dom.window.Event('pagehide'));
      dom.window.close();
      dom = null;
    }
  }
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    return current().window.eval(expression) as T;
  }
  async function wait(expression: string, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await evaluate(expression)) return;
      await delay(25);
    }
    throw new Error(
      `DOM-only condition timed out: ${expression}\n${current().window.document.body.textContent}`,
    );
  }
  async function navigate(url: string) {
    await close();
    const console = new VirtualConsole();
    console.on('jsdomError', (error) => {
      if (!error.message.includes('Not implemented: navigation'))
        process.stderr.write(error.message + '\n');
    });
    dom = await JSDOM.fromURL(url, {
      resources: 'usable',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      virtualConsole: console,
      beforeParse(window) {
        Object.assign(window, {
          fetch: globalThis.fetch,
          Headers: globalThis.Headers,
          Request: globalThis.Request,
          Response: globalThis.Response,
          AbortController: globalThis.AbortController,
          AbortSignal: globalThis.AbortSignal,
          structuredClone: globalThis.structuredClone,
          TextEncoder: globalThis.TextEncoder,
          TextDecoder: globalThis.TextDecoder,
        });
        Object.defineProperty(window, 'crypto', { value: webcrypto });
        // JSDOM has no layout/innerText implementation. Functional assertions use textContent;
        // this diagnostic shim must never be interpreted as a visual/accessibility test.
        Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
          get() {
            return (this as HTMLElement).textContent;
          },
        });
      },
    });
    await wait("document.readyState==='complete'");
  }
  const click = async (text: string) => {
    // Await the next read/render, not merely disappearance of the previous form.
    const selector = `[...document.querySelectorAll('button')].filter(b=>b.textContent===${JSON.stringify(text)}&&!b.disabled)`;
    await wait(`(${selector}).length===1`);
    await evaluate(
      `(()=>{const items=${selector};if(items.length!==1)throw new Error('Button changed before click');items[0].click();})()`,
    );
  };
  const fill = (name: string, value: string | boolean) =>
    evaluate(
      `(()=>{const input=document.querySelector('main [name="'+${JSON.stringify(name)}+'"]');if(!input)throw new Error('Missing input');if(input.type==='checkbox')input.checked=${JSON.stringify(value)};else input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  return {
    evaluate,
    wait,
    click,
    fill,
    close,
    navigate,
    reload: async () => navigate(current().window.location.href),
    send: async (
      _method: string,
      _params?: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      throw new Error('DOM-only driver cannot claim Chromium/viewport/screenshot acceptance.');
    },
  };
}
