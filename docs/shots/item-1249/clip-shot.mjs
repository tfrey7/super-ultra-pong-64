#!/usr/bin/env node
/*
 * docs/shots/item-1249/clip-shot.mjs -- the PlayStation 2 era's players kept
 * between its letterbox bars by the rig's own clip (item 1249).
 *
 *   node docs/shots/item-1249/clip-shot.mjs [--port 9361]
 *
 * Opens the real index.html?era=8 in headless Chrome, waits for the two
 * operative sheets to decode, puts both paddles hard against the far rail
 * (the case where a far player's head reaches the top bar), and draws the
 * frame three ways on 800 x 600 canvases: the rig as it ships (clip on), the
 * era's clip taken away, and the players switched off. It counts the pixels
 * inside the two bars that differ from the no-players frame, and saves
 * clip-far-rail.png beside itself: clip on at the left, clip off at the right.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const PORT = Number((process.argv.find((a, i) => process.argv[i - 1] === '--port')) || 9361);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=8';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--window-size=1000,760',
  '--allow-file-access-from-files', '--remote-debugging-port=' + PORT, '--no-first-run',
  '--no-default-browser-check', url], { name: 'item1249' }).catch(refusePortTaken);
try {
  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    if (!wsUrl) await sleep(100);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new CdpConnection(ws);
  await s.send('Runtime.enable');
  await sleep(1500);
  const r = await s.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
    const R = window.PongRender, PC = window.PongCharacters, S = window.PongSprites;
    const names = ['era8-sheet-left', 'era8-sheet-right'];
    names.forEach((n) => S.load(n));
    for (let i = 0; i < 100 && !names.every((n) => S.ready(n)); i++) await new Promise((r) => setTimeout(r, 50));
    const g = Object.assign({}, window.__pong, { era: 8, serveDelay: 0, events: [] });
    g.left = Object.assign({}, g.left, { y: 0, vy: 0 });
    g.right = Object.assign({}, g.right, { y: 0, vy: 0 });
    const frame = () => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; R.draw(c.getContext('2d'), g); return c; };
    const px = (c) => c.getContext('2d').getImageData(0, 0, 800, 600).data;
    const bar = R.eraLook(8).fx.BAR;
    const saved = PC.ERAS[8].clip;
    // Pixels a frame differs from the same frame with no players, inside rows [y0, y1).
    const diff = (d, n, y0, y1) => { let k = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < 800; x++) {
      const i = (y * 800 + x) * 4; if (d[i] !== n[i] || d[i + 1] !== n[i + 1] || d[i + 2] !== n[i + 2]) k++; } return k; };
    const bars = (d, n) => diff(d, n, 0, bar) + diff(d, n, 600 - bar, 600);
    const noPlayers = () => { PC.enabled = false; const c = frame(); PC.enabled = true; return c; };
    // The camera drifts: sweep 40 s of it, clip off, for the moment a player reaches furthest into a bar.
    let worst = { t: 0, px: -1 };
    const sweep = [];
    for (let t = 0; t <= 40; t += 1) {
      g.time = t;
      PC.ERAS[8].clip = null;
      const k = bars(px(frame()), px(noPlayers()));
      PC.ERAS[8].clip = saved;
      sweep.push(k);
      if (k > worst.px) worst = { t, px: k };
    }
    g.time = worst.t;
    const none = noPlayers(), n = px(none);
    const on = frame();
    PC.ERAS[8].clip = null;
    const off = frame();
    // A deliberately tight band, to show the clip cutting the figures in the page.
    PC.ERAS[8].clip = { y0: 110, y1: 548 };
    const tight = frame();
    PC.ERAS[8].clip = saved;
    const a = px(on), b = px(off), c3 = px(tight);
    const both = document.createElement('canvas'); both.width = 2432; both.height = 600;
    const bc = both.getContext('2d'); bc.fillStyle = '#ff00ff'; bc.fillRect(0, 0, 2432, 600);
    bc.drawImage(on, 0, 0); bc.drawImage(off, 816, 0); bc.drawImage(tight, 1632, 0);
    return { sheetsReady: names.map((n) => S.ready(n)), bar, worstTime: worst.t,
             barPixelsFromPlayersClipOffPerSecond: sweep,
             barPixelsFromPlayers: { clipOn: bars(a, n), clipOff: bars(b, n) },
             picturePixelsFromPlayers: { clipOn: diff(a, n, bar, 600 - bar), clipOff: diff(b, n, bar, 600 - bar),
                                         tightBand110: diff(c3, n, bar, 600 - bar) },
             tightBandPixelsAbove110: diff(c3, n, 0, 110),
             png: both.toDataURL('image/png') };
  })()` });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  const v = r.result.value;
  const out = path.join(HERE, 'clip-far-rail.png');
  fs.writeFileSync(out, Buffer.from(v.png.split(',')[1], 'base64'));
  delete v.png;
  console.log(JSON.stringify(v, null, 2));
  console.log('saved ' + out);
  ws.close();
} finally {
  await chrome.close();
}
