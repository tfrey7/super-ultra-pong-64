#!/usr/bin/env node
/*
 * docs/shots/item-1287/frame.mjs -- the same era 1 rally frame, drawn by the
 * real page, for item 1287's before-and-after pair.
 *
 *   node docs/shots/item-1287/frame.mjs --root <checkout> --out <png> [--port 9471]
 *
 * Opens <checkout>/index.html?era=1&title=off off disk in headless Chrome,
 * stops the rules (the loop keeps drawing), and hands the page one pinned
 * state: the score 3-2, the player in grass green against the computer in red
 * (paddle inks 3 and 9), the ball up in the stand's lines where the card's
 * four-colour rule is tested, both paddles mid-court, the stand on a fixed
 * phase. Run it against master's checkout for "before" and the branch for
 * "after": the same frame, only the inks differ.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const ROOT = path.resolve(arg('--root', '.'));
const OUT = path.resolve(arg('--out', 'frame.png'));
const PORT = Number(arg('--port', 9471));
const BALL_Y = Number(arg('--ball-y', 40));   // 40: up in the stand's lines; 330: open court
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=1&title=off';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio',
  '--allow-file-access-from-files', '--window-size=1000,760',
  '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', url], { name: 'frame1287' }).catch(refusePortTaken);
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
  await s.send('Page.enable');
  await sleep(2000);                       // the sheets load
  const r = await s.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const g = window.__pong;
    if (window.PongFeel) window.PongFeel.step = () => {};
    window.Pong.step = () => {};
    if (window.PongMatch) window.PongMatch.step = () => {};
    g.phase = 'playing'; g.era = 1; g.colour = true;
    g.paddleColour = { left: 3, right: 9 };
    g.score.left = 3; g.score.right = 2;
    g.time = 30.1; g.eraChangedAt = 0.001; g.serveDelay = 0;
    g.rally = 0; g.events = [];
    g.ball.x = 412; g.ball.y = ${BALL_Y}; g.ball.vx = 300; g.ball.vy = -120;
    g.left.y = 220; g.right.y = 300; g.left.vy = 0; g.right.vy = 0;
    return { era: g.era, inks: [window.PongRender.paddleInk(g, 'left'), window.PongRender.paddleInk(g, 'right')] };
  })()` });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  await sleep(600);
  const shot = await s.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(OUT + '  inks ' + r.result.value.inks.join(' '));
  ws.close();
} finally {
  await chrome.close();
}
