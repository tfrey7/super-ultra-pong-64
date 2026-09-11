/*
 * Item 1228: does the PlayStation's new dressing (the skyline, the windows, the
 * two searchlights, the fight HUD and the two stand-in fighters) cost frame
 * time? item 1231's era7ab.mjs with its eras changed: the playtest's own Chrome
 * setup (--disable-gpu, display layer on), one second of ordinary play on the
 * page's own rAF clock, both paddles held on the ball so no point goes in, era
 * 4 once as a control for machine load and era 5 four times.
 *
 *   node docs/measure/item1228/era5ab.mjs --label branch [--port 9472]
 *
 * Run it on the branch, then with master's era 5 file and rig checked out
 * (git checkout master -- src/eras/era5-playstation.js src/characters.js) as
 * --label master, and put them back (git checkout HEAD -- the same two).
 * Writes era5ab-<label>.json beside itself.
 */import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', 9472));
const LABEL = arg('label', 'run');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

function stats(d) {
  const s = d.slice().sort((a, b) => a - b), total = s.reduce((a, b) => a + b, 0);
  return { frames: s.length, total: +total.toFixed(1), mean: +(total / Math.max(1, s.length)).toFixed(2),
    p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), max: +(s[s.length - 1] || 0).toFixed(2) };
}

const flags = ['--disable-gpu', '--headless=new', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files',
  '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run',
  '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'era5ab' }).catch(refusePortTaken);
const rows = [];
let ws;
try {
  let wsUrl = null;
  for (let t = 0; t < 60 && !wsUrl; t++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* coming up */ }
    if (!wsUrl) await sleep(250);
  }
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  for (const era of [4, 5, 5, 5, 5]) {
    await s.send('Page.navigate', { url: `${base}?era=${era}` });
    for (let t = 0; t < 100; t++) {
      if (await s.eval('!!(window.__pong && document.getElementById("field"))').catch(() => false)) break;
      await sleep(100);
    }
    await sleep(600);        // the fighter sheets load and are cut once
    await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
    for (let t = 0; t < 80; t++) {
      if (await s.eval('window.__pong.phase === "playing" && window.__pong.serveDelay <= 0')) break;
      await sleep(50);
    }
    let done = false;
    const timing = s.eval(`new Promise((done) => {
      const d = []; let last = null, kept = 0; const t0 = performance.now();
      function tick(now) {
        const g = window.__pong, m = window.PongRender.eraChangeMoment(g);
        const ordinary = g.phase === 'playing' && g.era === ${era} && g.serveDelay <= 0 && !(m && m.wiping);
        if (ordinary && last !== null) { d.push(now - last); kept += now - last; }
        last = ordinary ? now : null;
        if (kept < 1000 && now - t0 < 3000) requestAnimationFrame(tick); else done(d);
      }
      requestAnimationFrame(tick);
    })`).finally(() => { done = true; });
    while (!done) {
      await s.eval(`(() => { const g = window.__pong;
        for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + 6 - p.h / 2));
        return 0; })()`);
      await sleep(30);
    }
    const d = await timing;
    rows.push({ label: LABEL, era, ...stats(d) });
    console.log(`${LABEL} era ${era}: mean ${rows.at(-1).mean} ms, p95 ${rows.at(-1).p95} ms over ${rows.at(-1).frames} frames`);
  }
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}

const seven = rows.filter((r) => r.era === 5);
const mean = +(seven.reduce((a, r) => a + r.mean, 0) / seven.length).toFixed(2);
const out = path.join(HERE, 'era5ab-' + LABEL + '.json');
writeFileSync(out, JSON.stringify({ taken: new Date().toISOString(), label: LABEL, era5MeanOfMeans: mean, rows }, null, 1) + '\n');
console.log(`${LABEL}: era 5 mean of four means ${mean} ms; wrote ${out}`);
