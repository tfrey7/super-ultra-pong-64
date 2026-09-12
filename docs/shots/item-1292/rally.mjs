#!/usr/bin/env node
/*
 * docs/shots/item-1292/rally.mjs -- era 6's blob shadows and the N64 smear, in a real
 * browser, for item 1292.
 *
 *   node docs/shots/item-1292/rally.mjs [--port 9471]
 *
 * Three legs, each its own headless Chrome off disk, each posed to the SAME rally
 * frame (the ball pinned mid-flight, both bats held, the rally at 4) so before and
 * after are the same picture with one thing changed:
 *
 *   before  era 6 with this card's work switched off at the look
 *           (fieldSetup null, render null): the field exactly as era 5 left it
 *   after   era 6 as it ships
 *   era5    era 5 itself, for the blur comparison
 *
 * Each leg saves a PNG, reads a column of the page's own canvas back with
 * getImageData (Chrome is given --allow-file-access-from-files) and measures the far
 * rail's top edge -- the strongest vertical brightness step in the upper half of the
 * table, and how many rows the step is smeared over -- and times two seconds of play
 * on the page's own frame clock. Numbers land in measurements.json beside the shots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(argOf('--port', 9471));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The pose: a ball caught mid-court on its way to the far bat, the bats apart so both
// blob shadows are clear of each other, the rally at 4 so the pie meter is half lit.
const POSE = { ball: { x: 470, y: 250 }, left: 150, right: 330, rally: 4 };

const LEGS = [
  { key: 'before', era: 6, file: 'rally-era6-before.png',
    pre: "PongRender.eraLook(6).fieldSetup = null; PongRender.eraLook(6).render = null;" },
  { key: 'after', era: 6, file: 'rally-era6-after.png', pre: '' },
  { key: 'era5', era: 5, file: 'rally-era5-playstation.png', pre: '' }
];

const out = {};
for (let i = 0; i < LEGS.length; i++) out[LEGS[i].key] = await leg(LEGS[i], PORT + i * 2);

const line = (k) => {
  const m = out[k];
  return `${k.padEnd(7)} far-rail edge at row ${m.edge.row}, step ${m.edge.step.toFixed(1)} of 255 ` +
         `smeared over ${m.edge.width} rows; frames mean ${m.frames.mean.toFixed(1)} ms, ` +
         `p95 ${m.frames.p95.toFixed(1)} ms, max ${m.frames.max.toFixed(1)} ms`;
};
console.log('');
for (const l of LEGS) console.log(line(l.key));
console.log(`\nthe smear: era 6's far rail edge spans ${out.after.edge.width} rows against era 5's ` +
            `${out.era5.edge.width} (before this card, ${out.before.edge.width})`);
fs.writeFileSync(path.join(HERE, 'measurements.json'), JSON.stringify(out, null, 2) + '\n');

async function leg(spec, port) {
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=' + spec.era;
  const chrome = await launchChrome(CHROME, ['--headless=new', '--mute-audio',
    '--allow-file-access-from-files', '--window-size=1000,760',
    '--remote-debugging-port=' + port, '--no-first-run', '--no-default-browser-check', url],
    { name: 'item1292-' + spec.key }).catch(refusePortTaken);
  try {
    let wsUrl = null;
    for (let i = 0; i < 100 && !wsUrl; i++) {
      try {
        const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) wsUrl = page.webSocketDebuggerUrl;
      } catch { /* not up yet */ }
      if (!wsUrl) await sleep(100);
    }
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const s = new CdpConnection(ws);
    await s.send('Runtime.enable');
    await s.send('Page.enable');
    await sleep(1600);
    const evalv = async (expression) => {
      const r = await s.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
      if (r.exceptionDetails) throw new Error(spec.key + ': ' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    if (spec.pre) await evalv(spec.pre);
    const box = await evalv(`(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
    const mouse = (x, y, type = 'mouseMoved') =>
      s.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await mouse(box.x + box.w / 2, box.y + box.h / 2, 'mousePressed');
    await mouse(box.x + box.w / 2, box.y + box.h / 2, 'mouseReleased');
    await sleep(400);
    // Pin the pose every frame: the ball still where it is, both bats held, the rally at 4.
    await evalv(`(() => { const g = window.__pong, P = ${JSON.stringify(POSE)};
      const hold = () => { g.serveDelay = 0; g.rally = P.rally;
        g.ball.x = P.ball.x; g.ball.y = P.ball.y; g.ball.vx = 0; g.ball.vy = 0;
        g.ball.spin = 0; g.ball.burst = 0;
        g.left.y = P.left; g.right.y = P.right;
        requestAnimationFrame(hold); };
      requestAnimationFrame(hold);
      window.__f1292 = []; let last = performance.now();
      const tick = (now) => { window.__f1292.push(now - last); last = now;
        if (window.__f1292.length < 120) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); return true; })()`);
    await sleep(2200);
    const shot = await s.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(HERE, spec.file), Buffer.from(shot.data, 'base64'));
    const edge = await evalv(edgeProbe());
    const t = (await evalv('window.__f1292')).slice(10).sort((a, b) => a - b);
    const frames = { n: t.length, mean: t.reduce((a, b) => a + b, 0) / t.length,
                     p95: t[Math.floor(t.length * 0.95)], max: t[t.length - 1] };
    console.log(`${spec.key}: ${spec.file}`);
    ws.close();
    return { era: spec.era, shot: spec.file, edge, frames };
  } finally {
    await chrome.close();
  }
}

/**
 * The far rail's top edge, read off the page's own canvas: down a column just left of
 * centre (clear of the net and the ball), over the top third where the far rail meets
 * the world, the strongest brightness step -- and how many rows carry at least a
 * quarter of it, which is the width the smear gives that edge.
 */
function edgeProbe() {
  return `(() => {
    const c = document.querySelector('canvas');
    const g = c.getContext('2d');
    const x = Math.round(c.width * 0.38);
    const h = Math.round(c.height * 0.42);
    const d = g.getImageData(x, 0, 1, h).data;
    const lum = [];
    for (let i = 0; i < h; i++) lum.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    const slope = [];
    for (let i = 1; i < h; i++) slope.push(lum[i] - lum[i - 1]);
    let at = 0;
    for (let i = 0; i < slope.length; i++) if (Math.abs(slope[i]) > Math.abs(slope[at])) at = i;
    const step = Math.abs(slope[at]), cut = step * 0.25, sign = Math.sign(slope[at]);
    let lo = at, hi = at;
    while (lo > 0 && Math.sign(slope[lo - 1]) === sign && Math.abs(slope[lo - 1]) >= cut) lo--;
    while (hi < slope.length - 1 && Math.sign(slope[hi + 1]) === sign && Math.abs(slope[hi + 1]) >= cut) hi++;
    return { column: x, canvas: [c.width, c.height], row: at + 1, step: step, width: hi - lo + 1 };
  })()`;
}
