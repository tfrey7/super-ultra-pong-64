#!/usr/bin/env node
/*
 * docs/measure/item1233/era9ab.mjs -- era 9's frame time with its AAA pass
 * (item 1233: the players, the hangar, the beacons, the steam) against the
 * same era without it, on the same machine, in the same minute.
 *
 *   node docs/measure/item1233/era9ab.mjs --base "<a checkout of master>" [--port 9571] [--rounds 3]
 *
 * Each round opens index.html?era=9 in this checkout (`branch`) and in the
 * base checkout (`base`), alternately, under the playtest's own Chrome flags
 * (--disable-gpu, display layer on), and times one second of ordinary play on
 * the page's rAF clock with both paddles held on the ball -- the reading
 * tools/playtest.mjs takes on its climb (docs/measure/item1192/eraspeed.mjs is
 * where this is copied from). Era 8 is timed beside it in each tree as a
 * control for how loaded the machine is. The first branch round also saves a
 * rally frame as era9-rally.png, caught with the ball coming at the left
 * player. Writes era9ab.json beside itself.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : dflt; };
const PORT = Number(arg('--port', 9571));
const ROUNDS = Number(arg('--rounds', 3));
const BASE = arg('--base', null);
if (!BASE) { console.error('usage: era9ab.mjs --base "<a checkout of master>"'); process.exit(2); }
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const urlOf = (root) => 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

function stats(d) {
  const s = d.slice().sort((a, b) => a - b), total = s.reduce((a, b) => a + b, 0);
  return { frames: s.length, mean: +(total / Math.max(1, s.length)).toFixed(2),
    p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), max: +(s[s.length - 1] || 0).toFixed(2) };
}

async function timeEra(s, base, era, shot) {
  await s.send('Page.navigate', { url: `${base}?era=${era}` });
  for (let t = 0; t < 100; t++) {
    if (await s.eval('!!(window.__pong && document.getElementById("field"))').catch(() => false)) break;
    await sleep(100);
  }
  await sleep(1500);                                   // the sheets and pictures decode
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  for (let t = 0; t < 80; t++) {
    if (await s.eval('window.__pong.phase === "playing" && window.__pong.serveDelay <= 0')) break;
    await sleep(50);
  }
  const hold = () => s.eval(`(() => { const g = window.__pong;
    for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + 6 - p.h / 2));
    return 0; })()`);
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
  while (!done) { await hold(); await sleep(30); }
  const row = stats(await timing);
  if (shot) {
    // A rally frame: the ball on its way to the left player, inside the glint's reach.
    for (let t = 0; t < 200; t++) {
      await hold();
      const near = await s.eval('(() => { const g = window.__pong; return g.era === 9 && g.ball.vx < 0 && g.ball.x < 170 && g.ball.x > 70; })()');
      if (near) break;
      await sleep(15);
    }
    const png = await s.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(HERE, 'era9-rally.png'), Buffer.from(png.data, 'base64'));
    console.log('wrote ' + path.join(HERE, 'era9-rally.png'));
  }
  return row;
}

const flags = ['--disable-gpu', '--headless=new', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files',
  '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'item1233-era9ab' }).catch(refusePortTaken);
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
  for (let r = 0; r < ROUNDS; r++) {
    for (const [tree, root] of (r % 2 ? [['base', BASE], ['branch', ROOT]] : [['branch', ROOT], ['base', BASE]])) {
      for (const era of [9, 8]) {
        const row = { round: r + 1, tree, era, ...(await timeEra(s, urlOf(root), era, r === 0 && tree === 'branch' && era === 9)) };
        rows.push(row);
        console.log(`round ${row.round} ${tree.padEnd(6)} era ${era}: mean ${row.mean} ms, p95 ${row.p95} ms, max ${row.max} ms over ${row.frames} frames`);
      }
    }
  }
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const mean = (tree, era) => { const m = rows.filter((x) => x.tree === tree && x.era === era).map((x) => x.mean);
  return +(m.reduce((a, b) => a + b, 0) / m.length).toFixed(2); };
const summary = { branch9: mean('branch', 9), base9: mean('base', 9), branch8: mean('branch', 8), base8: mean('base', 8) };
console.log(`era 9: branch ${summary.branch9} ms against base ${summary.base9} ms; era 8 control: ${summary.branch8} against ${summary.base8}`);
writeFileSync(path.join(HERE, 'era9ab.json'), JSON.stringify({ taken: new Date().toISOString(), base: BASE, summary, rows }, null, 1) + '\n');
console.log('wrote ' + path.join(HERE, 'era9ab.json'));
