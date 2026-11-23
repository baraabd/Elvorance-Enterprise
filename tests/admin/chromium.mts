/** Minimal Chrome DevTools test driver; Chromium is an explicit test prerequisite. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
type Message = { id?: number; error?: { message: string }; result?: Record<string, unknown> };
export async function browser() {
  const executable = process.env.ELVORANCE_CHROMIUM;
  if (!executable)
    throw new Error(
      'Set ELVORANCE_CHROMIUM to the installed Chromium executable; tests must not silently skip.',
    );
  const directory = await mkdtemp(join(tmpdir(), 'elvorance-s05-browser-'));
  const child = spawn(
    executable,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${directory}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let socket: WebSocket | undefined;
  async function close() {
    socket?.close();
    child.kill();
    await Promise.race([
      new Promise<void>((resolve) => child.once('exit', () => resolve())),
      delay(2000),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await rm(directory, { recursive: true, force: true });
  }
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      let stderr = '';
      const timer = setTimeout(() => reject(new Error('Chromium startup timed out')), 15000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        const found = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (found?.[1]) {
          clearTimeout(timer);
          resolve(found[1]);
        }
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Chromium exited before test connection.'));
      });
    });
    const http = endpoint.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '');
    const target = (await (
      await fetch(http + '/json/new?about:blank', { method: 'PUT' })
    ).json()) as { webSocketDebuggerUrl: string };
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    socket = ws;
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('CDP connection failed')), {
        once: true,
      });
    });
    let sequence = 0;
    const pending = new Map<
      number,
      {
        resolve: (value: Record<string, unknown>) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as Message;
      if (!message.id) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result ?? {});
    });
    ws.addEventListener('close', () => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Browser closed.'));
      }
      pending.clear();
    });
    const send = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, 15000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    async function evaluate<T = unknown>(expression: string): Promise<T> {
      const response = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return (response.result as { value: T }).value;
    }
    async function wait(expression: string, timeout = 15000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw new Error(
        `Browser condition timed out: ${expression}\n${await evaluate('document.body.innerText')}`,
      );
    }
    await send('Page.enable');
    await send('Runtime.enable');
    const click = async (text: string) => {
      // Await the next read/render, not merely disappearance of the previous form.
      const selector = `[...document.querySelectorAll('button')].filter(b=>b.textContent===${JSON.stringify(text)}&&!b.disabled&&b.getClientRects().length>0)`;
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
      send,
      evaluate,
      wait,
      click,
      fill,
      close,
      navigate: async (url: string) => {
        await send('Page.navigate', { url });
        await wait("document.readyState==='complete'");
      },
      reload: async () => {
        const before = await evaluate<string | null>(
          "document.querySelector('[data-admin-mount]')?.dataset.adminMount??null",
        );
        await send('Page.reload');
        await wait(
          "document.readyState==='complete' && (document.querySelector('[data-admin-mount]')?.dataset.adminMount??null)!==" +
            JSON.stringify(before),
        );
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
