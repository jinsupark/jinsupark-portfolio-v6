// Screenshot a page in headless Chrome over CDP, optionally after a drag.
//   node scripts/shoot.mjs <url> <out.png> [width] [height] [drag]
// `drag` is "x0,y0;x1,y1;..." in CSS pixels. Console errors are printed, which
// is where a shader compile failure shows up.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, w = '1440', h = '900', drag = ''] = process.argv.slice(2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Port 0 lets Chrome pick a free port and write it to the profile, so shots
// run in parallel can't land on each other's browser.
const profile = mkdtempSync(join(tmpdir(), 'shoot-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  `--window-size=${w},${h}`,
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8')
      .split('\n')[0]
      .trim();
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  } else if (
    msg.method === 'Runtime.consoleAPICalled' &&
    ['error', 'warning'].includes(msg.params.type)
  ) {
    console.log(
      `[${msg.params.type}]`,
      msg.params.args
        .map((a) => a.value ?? a.description)
        .join(' ')
        .slice(0, 3000),
    );
  } else if (msg.method === 'Runtime.exceptionThrown') {
    console.log(
      '[exception]',
      msg.params.exceptionDetails.exception?.description,
    );
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: +w,
  height: +h,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.enable');
// STORE='{"key":"lab:poster-v2","value":{...}}' seeds saved control values.
if (process.env.STORE) {
  const { key, value } = JSON.parse(process.env.STORE);
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))})`,
  });
}
await send('Page.navigate', { url });
await sleep(Number(process.env.WAIT ?? 7000));

// PRE='…' runs in the page before the drag, e.g. to pick a tool.
if (process.env.PRE) {
  await send('Runtime.evaluate', {
    expression: process.env.PRE,
    awaitPromise: true,
  });
  await sleep(300);
}

if (drag) {
  const pts = drag.split(';').map((p) => p.split(',').map(Number));
  const mouse = (type, [x, y], buttons) =>
    send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons,
      clickCount: 1,
    });
  await mouse('mousePressed', pts[0], 1);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let s = 1; s <= 12; s++) {
      await mouse(
        'mouseMoved',
        [ax + ((bx - ax) * s) / 12, ay + ((by - ay) * s) / 12],
        1,
      );
      await sleep(16);
    }
  }
  await mouse('mouseReleased', pts.at(-1), 0);
  await sleep(800);
}

// EVAL='…' runs in the page before the shot (awaited); its result is printed.
if (process.env.EVAL) {
  const r = await send('Runtime.evaluate', {
    expression: process.env.EVAL,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log('[eval]', JSON.stringify(r.result?.value ?? r.exceptionDetails));
  await sleep(Number(process.env.AFTER ?? 1500));
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
ws.close();
chrome.kill();
process.exit(0);
