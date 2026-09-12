/*
 * Item 1274: what do two glTF figures cost a 3D era's frame? One second of
 * ordinary play at each of eras 5 to 10, opened with index.html?era=N, on the
 * page's own rAF clock -- the reading tools/playtest.mjs takes on its climb --
 * in the playtest's own headless Chrome (--disable-gpu, WebGL in software
 * through --enable-unsafe-swiftshader), under two setups, alternated era by era
 * so the machine's load falls on both alike:
 *
 *   figures   the default: the 3D layer stands both players as glTF figures
 *   polygon   ?figures=off: the 3D layer draws the table, and the players are
 *             item 1248's canvas polygon figures on top (master before this card)
 *
 * Both paddles follow the ball while the clock runs (so the move clips play and
 * no point goes in). Each reading also records whether the figure file had
 * loaded and whether the layer really drew the figures that frame.
 *
 *   node docs/measure/item-1274/figspeed.mjs [--port 9481] [--rounds 2]
 *
 * Writes figspeed.json beside itself.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, d) => { const i = process.argv.indexOf(name); return i !== -1 ? Number(process.argv[i + 1]) : d; };
const str = (name, d) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : d; };
const PORT = arg('--port', 9481);
const ROUNDS = arg('--rounds', 2);
// Item 1299's copy: since item 1283 NO era block names a figure, so the reading
// asks for one the way a test does (?figure=<name>), and it can be taken over
// one era rather than all six.
const ERAS = str('--eras', '5,6,7,8,9,10').split(',').map(Number);
const FIGURE = str('--figure', 'player-proof-hi');
const LABEL = str('--label', 'run');
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
  return { frames: s.length, mean: +(total / Math.max(1, s.length)).toFixed(2),
    p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(2), max: +(s[s.length - 1] || 0).toFixed(2) };
}

async function one(s, era, setup) {
  await s.send('Page.navigate', { url: `${base}?era=${era}&figure=${FIGURE}${setup === 'polygon' ? '&figures=off' : ''}` });
  for (let t = 0; t < 100; t++) {
    if (await s.eval('!!(window.__pong && document.getElementById("field"))').catch(() => false)) break;
    await sleep(100);
  }
  await sleep(600);
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  for (let t = 0; t < 80; t++) {
    if (await s.eval('window.__pong.phase === "playing" && window.__pong.serveDelay <= 0')) break;
    await sleep(50);
  }
  // Count the frames the layer stood the figures in: wrap takeFigures for the reading.
  await s.eval(`(() => { const F = window.PongField3D; window.__figDrawn = 0; window.__figFrames = 0;
    if (!F.__wrapped) { const take = F.takeFigures; F.takeFigures = function () { const t = take(); window.__figFrames++; if (t) window.__figDrawn++; return t; }; F.__wrapped = true; }
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
  while (!done) {
    await s.eval(`(() => { const g = window.__pong;
      for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + 6 - p.h / 2));
      return 0; })()`);
    await sleep(30);
  }
  const d = await timing;
  const info = await s.eval(`(() => { const C = window.PongCharacters, F = window.PongField3D;
    const cfg = C.configFor(${era}, 'left'); const name = cfg.figure || cfg.model;
    return { name, file: F.figureState(name), gl: F.available(), drawn: window.__figDrawn, asked: window.__figFrames }; })()`);
  return { setup, era, ...info, ...stats(d) };
}

const flags = ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio',
  '--allow-file-access-from-files', '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run',
  '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'figspeed' }).catch(refusePortTaken);
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
  for (let round = 0; round < ROUNDS; round++) {
    for (const era of ERAS) {
      for (const setup of round % 2 ? ['polygon', 'figures'] : ['figures', 'polygon']) {
        const r = await one(s, era, setup);
        rows.push({ round, ...r });
        console.log(`${setup.padEnd(8)} era ${String(era).padStart(2)} ${String(r.name).padEnd(17)} file ${(r.file && r.file.state) || '-'} ` +
          `figures drawn ${r.drawn}/${r.asked}: mean ${r.mean} ms, p95 ${r.p95} ms over ${r.frames} frames`);
      }
    }
  }
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const out = path.join(HERE, `figspeed-${LABEL}.json`);
writeFileSync(out, JSON.stringify({ taken: new Date().toISOString(), figure: FIGURE, eras: ERAS, rows }, null, 1) + '\n');
console.log('wrote ' + out);
