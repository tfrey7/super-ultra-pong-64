#!/usr/bin/env node
/*
 * docs/shots/item-1292/rally.mjs -- era 6's blob shadows and the N64 smear, in a real
 * browser, for item 1292.
 *
 *   node docs/shots/item-1292/rally.mjs [--port 9471]
 *
 * Two legs, each its own headless Chrome off disk, each posed to the same rally frame
 * (the ball pinned mid-flight, both bats held, the rally at 4):
 *
 *   era 6  ONE page, shot twice: first with this card's work taken off the look
 *          (fieldSetup and render null, so the field is exactly what era 5 left),
 *          then with it put back. The pose never moves between the two, so the pair
 *          is the same frame with one thing changed, and the page itself diffs them:
 *          which pixels darkened, by how much, and where.
 *   era 5  the PlayStation, for the blur comparison.
 *
 * Each leg also reads a column of the page's own canvas back with getImageData (Chrome
 * is given --allow-file-access-from-files), finds the far rail's top edge -- the
 * strongest vertical brightness step over the table -- and reports how many rows the
 * step is smeared over, and times two seconds of play on the page's own frame clock.
 * Numbers land in measurements.json beside the shots.
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

// The pose: the ball caught mid-court on its way to the far bat, the bats well apart so
// the two players' shadows are clear of each other, the rally at 4 (the pie half lit).
const POSE = { ball: { x: 470, y: 250 }, left: 150, right: 330, rally: 4 };

const out = {};
out.era6 = await leg({ key: 'era6', era: 6, before: 'rally-era6-before.png', after: 'rally-era6-after.png' }, PORT);
out.era5 = await leg({ key: 'era5', era: 5, after: 'rally-era5-playstation.png' }, PORT + 2);

const edgeLine = (k, which) => {
  const e = out[k][which].edge;
  return `${(k + ' ' + which).padEnd(12)} strongest step at row ${e.row}: ${e.step.toFixed(1)} of 255 ` +
         `over ${e.width} row(s); over the table, mean edge ${e.table.meanEdge.toFixed(2)} of 255, ` +
         `${(100 * e.table.hardEdges / e.table.pairs).toFixed(2)}% of neighbours a hard edge`;
};
console.log('');
console.log(edgeLine('era6', 'before'));
console.log(edgeLine('era6', 'after'));
console.log(edgeLine('era5', 'after'));
const d = out.era6.diff;
console.log(`\nthe shadows: switching this card on darkened ${d.darker} pixels of the page ` +
  `(mean ${d.meanDrop.toFixed(1)} of 255), in ${d.clusters.length} patches: ` +
  d.clusters.map((c) => `${c.n} px around (${c.x}, ${c.y})`).join('; '));
const px = (k, w) => out[k][w].layer.renders.join(' x ');
console.log(`the machine's frame, stretched over the same 800 x 600 field: era 6 ${px('era6', 'after')} ` +
  `(before this card ${px('era6', 'before')}), era 5 ${px('era5', 'after')}`);
console.log(`frames: era 6 mean ${out.era6.frames.mean.toFixed(1)} ms (WebGL ${out.era6.after.layer.stats.frames} frames, ` +
  `${(out.era6.after.layer.stats.ms / out.era6.after.layer.stats.frames).toFixed(1)} ms each), ` +
  `era 5 mean ${out.era5.frames.mean.toFixed(1)} ms`);
fs.writeFileSync(path.join(HERE, 'measurements.json'), JSON.stringify(out, null, 2) + '\n');

async function leg(spec, port) {
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=' + spec.era;
  // --disable-gpu with --enable-unsafe-swiftshader: WebGL on Chrome's software renderer, the
  // same pair tools/playtest.mjs uses. Without them the page falls back to the canvas table and
  // the 3D layer -- the whole subject of this card -- never runs.
  const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu',
    '--enable-unsafe-swiftshader', '--mute-audio', '--hide-scrollbars',
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

    const result = { era: spec.era };
    if (spec.before) {
      // take this card's work off the look: the field as era 5 left it
      await evalv(`(() => { const L = PongRender.eraLook(6);
        window.__kept1292 = { fieldSetup: L.fieldSetup, render: L.render };
        L.fieldSetup = null; L.render = null; return true; })()`);
      await sleep(700);
      result.before = await snapshot(spec.before);
      await evalv(`(() => { const L = PongRender.eraLook(6), K = window.__kept1292;
        L.fieldSetup = K.fieldSetup; L.render = K.render; return true; })()`);
      await sleep(700);
    }
    result.after = await snapshot(spec.after);
    if (spec.before) result.diff = await evalv(diffProbe());
    const t = (await evalv('window.__f1292')).slice(10).sort((a, b) => a - b);
    result.frames = { n: t.length, mean: t.reduce((a, b) => a + b, 0) / t.length,
                      p95: t[Math.floor(t.length * 0.95)], max: t[t.length - 1] };
    console.log(`${spec.key}: ${spec.after}${spec.before ? ' and ' + spec.before : ''}` +
      ` (WebGL on, ${result.after.layer.discs} era-6 discs showing)`);
    ws.close();
    return result;

    async function snapshot(file) {
      const shot = await s.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(HERE, file), Buffer.from(shot.data, 'base64'));
      const edge = await evalv(edgeProbe());
      const layer = await evalv(`(() => { const F = window.PongField3D;
        const I = F && F.internals && F.internals();
        return { webgl: !!(F && F.available()), why: F ? F.why() : 'no PongField3D',
                 stats: F && F.stats ? F.stats() : null,
                 // the machine's own frame: what the layer actually renders before it is
                 // stretched over the 800 x 600 field
                 renders: I ? [I.renderer.domElement.width, I.renderer.domElement.height] : null,
                 discs: I ? I.scene.children.filter((c) => c.userData.era === 6 && c.visible).length : 0 }; })()`);
      if (!layer.webgl) throw new Error(spec.key + ': no WebGL in this Chrome -- ' + layer.why);
      // keep this frame's pixels in the page, so the next one can be diffed against it
      await evalv(`(() => { const c = document.querySelector('canvas');
        window.__px1292 = (window.__px1292 || []);
        window.__px1292.push(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
        return window.__px1292.length; })()`);
      return { shot: file, edge, layer };
    }
  } finally {
    await chrome.close();
  }
}

/**
 * What the second frame darkened against the first, on the page's own pixels: how many
 * pixels lost more than 6 of 255 of brightness, the mean drop over them, and the three
 * biggest patches they fall into (on a 40-pixel grid), each with its centre.
 */
function diffProbe() {
  return `(() => {
    const c = document.querySelector('canvas'), W = c.width;
    const a = window.__px1292[0], b = window.__px1292[1];
    const L = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const cell = 40, cells = new Map();
    let n = 0, drop = 0;
    for (let i = 0; i < a.length; i += 4) {
      const diff = L(a, i) - L(b, i);
      if (diff <= 6) continue;
      n++; drop += diff;
      const p = i / 4, x = p % W, y = (p - x) / W;
      const key = Math.floor(y / cell) * 1000 + Math.floor(x / cell);
      const e = cells.get(key) || { n: 0, sx: 0, sy: 0 };
      e.n++; e.sx += x; e.sy += y;
      cells.set(key, e);
    }
    const clusters = [...cells.values()].sort((p, q) => q.n - p.n).slice(0, 3)
      .map((e) => ({ n: e.n, x: Math.round(e.sx / e.n), y: Math.round(e.sy / e.n) }));
    return { darker: n, meanDrop: n ? drop / n : 0, clusters: clusters, canvas: [c.width, c.height] };
  })()`;
}

/**
 * The far rail's top edge, read off the page's own canvas: down a column left of centre
 * (clear of the net and the ball), over the band where the far rail meets the world, the
 * strongest brightness step -- and how many rows carry at least a quarter of it, which is
 * the width the smear gives that edge.
 */
function edgeProbe() {
  return `(() => {
    const c = document.querySelector('canvas');
    const g = c.getContext('2d');
    const x = Math.round(c.width * 0.38);
    const top = Math.round(c.height * 0.20), h = Math.round(c.height * 0.50) - top;
    const d = g.getImageData(x, top, 1, h).data;
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
    // The smear, without picking a feature: over the whole table band, how hard the
    // picture's edges are. A filtered, lower-resolution frame carries less of this.
    const x0 = Math.round(c.width * 0.22), x1 = Math.round(c.width * 0.78);
    const y0 = Math.round(c.height * 0.28), y1 = Math.round(c.height * 0.72);
    const box = g.getImageData(x0, y0, x1 - x0, y1 - y0), bw = x1 - x0, bh = y1 - y0, bd = box.data;
    const lumAt = (px, py) => { const i = (py * bw + px) * 4;
      return 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2]; };
    let sum = 0, pairs = 0, hard = 0;
    for (let py = 1; py < bh; py++) {
      for (let px = 1; px < bw; px++) {
        const l = lumAt(px, py);
        const dv = Math.abs(l - lumAt(px, py - 1)), dh = Math.abs(l - lumAt(px - 1, py));
        sum += dv + dh; pairs += 2;
        if (dv > 16) hard++;
        if (dh > 16) hard++;
      }
    }
    return { column: x, canvas: [c.width, c.height], band: [top, top + h], row: top + at + 1,
             step: step, width: hi - lo + 1,
             table: { box: [x0, y0, x1, y1], meanEdge: sum / pairs, hardEdges: hard, pairs: pairs } };
  })()`;
}
