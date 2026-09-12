/*
 * Item 1256: era 8's two operatives, the PlayStation 2's players, standing at
 * the table in a real rally frame.
 *
 *   node docs/measure/item1256/shoot.mjs --label rally [--port 9451]
 *   node docs/measure/item1256/shoot.mjs --label before --root "G:/Claude Stuff/super-ultra-pong-64"
 *
 * In the playtest's headless Chrome (GPU off, WebGL on SwiftShader) it opens
 * index.html?era=8, times about 1.5 s of live play on the page's own frame
 * clock, then stops the rules and poses one rally frame (fixed paddles, ball
 * and clock, so the camera drift and the interlace parity are the same on any
 * tree), and asks the 3D layer itself what it is drawing: which figure files
 * loaded, how many skinned meshes stand in the scene, where each one's body
 * reaches on screen, what its materials are called. Writes:
 *   docs/shots/item-1256/<label>.png   the canvas as the page shows it
 *   <label>.json beside this script    the timing and every reading
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ROOT = path.resolve(arg('root', path.resolve(HERE, '..', '..', '..')));
const PORT = Number(arg('port', 9451));
const LABEL = arg('label', 'rally');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=8&title=off&music=off';
const SHOTS = path.resolve(HERE, '..', '..', 'shots', 'item-1256');

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  }
}

// Live play: frame gaps on the page's rAF clock.
const TIMING = `new Promise((res) => {
  const gaps = []; let last = 0;
  function f(ts) { if (last) gaps.push(ts - last); last = ts; if (gaps.length < 90) requestAnimationFrame(f); else res(gaps); }
  requestAnimationFrame(f);
}).then((g) => { g.sort((a, b) => a - b); const mean = g.reduce((a, b) => a + b, 0) / g.length;
  return { frames: g.length, meanMs: +mean.toFixed(1), p95Ms: +g[Math.floor(g.length * 0.95)].toFixed(1), maxMs: +g[g.length - 1].toFixed(1), era: window.__pong.era }; })`;

// Stop the rules and pose one rally frame: the left player mid-swing, the
// right one moving down, so the two are not playing the same clip.
const POSE = `(() => {
  const g = window.__pong, noop = function () {};
  if (window.PongFeel) window.PongFeel.step = noop;
  window.Pong.step = noop;
  g.phase = 'playing'; g.era = 8; g.time = 12; g.eraChangedAt = -100; g.serveDelay = 0; g.rally = 5;
  g.left.y = 190; g.right.y = 330; g.left.vy = 0; g.right.vy = 140;
  g.ball.x = 470; g.ball.y = 300; g.ball.vx = 300; g.ball.vy = 60;
  g.events = [{ type: 'paddle', side: 'left', time: 11.95 }];
  return { gl: !!(window.PongField3D && window.PongField3D.available()), why: window.PongField3D ? window.PongField3D.why() : 'no layer' };
})()`;

// Ask the layer what it is actually drawing.
const PROBE = `(() => {
  const F = window.PongField3D, C = window.PongCharacters, g = window.__pong;
  const names = { left: C.configFor(8, 'left').model || C.configFor(8, 'left').figure,
                  right: C.configFor(8, 'right').model || C.configFor(8, 'right').figure };
  const out = { names, sheets: { left: C.configFor(8, 'left').sheet, right: C.configFor(8, 'right').sheet },
    files: { left: F.figureState(names.left), right: F.figureState(names.right) },
    beats: { left: C.beatOf(C.memoryOf(g).left, g.time, g.left.vy, C.configFor(8, 'left')).beat,
             right: C.beatOf(C.memoryOf(g).right, g.time, g.right.vy, C.configFor(8, 'right')).beat } };
  const I = F.internals();
  if (!I) return Object.assign(out, { internals: null });
  const THREE = I.THREE, size = new THREE.Vector2();
  I.renderer.getSize(size);
  const figures = [];
  I.scene.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    let root = o; while (root.parent && root.parent !== I.scene) root = root.parent;
    if (!root.visible) return;
    const box = new THREE.Box3().setFromObject(o);
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(x, y, z).project(I.camera);
      corners.push([(v.x * 0.5 + 0.5) * size.x, (-v.y * 0.5 + 0.5) * size.y]);
    }
    const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
    const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => ({ name: m.name, colour: '#' + m.color.getHexString() }));
    figures.push({ name: root.name || o.name, worldX: +root.position.x.toFixed(1), scale: +root.scale.y.toFixed(2),
      heightUnits: +(box.max.y - box.min.y).toFixed(1),
      screen: { x0: +Math.min(...xs).toFixed(1), x1: +Math.max(...xs).toFixed(1),
                top: +Math.min(...ys).toFixed(1), bottom: +Math.max(...ys).toFixed(1) },
      materials: mats, triangles: o.geometry.index ? o.geometry.index.count / 3 : 0 });
  });
  out.renderSize = [size.x, size.y];
  out.figures = figures.sort((a, b) => a.screen.x0 - b.screen.x0);
  // The letterbox, in the same screen pixels: the era's bars over the picture.
  const L = window.PongRender.eraLook(8);
  const bar = L.fx && L.fx.BAR ? L.fx.BAR : 52;
  out.letterbox = { barFieldUnits: bar, barPx: +(bar / 600 * size.y).toFixed(1), heightPx: size.y };
  out.figuresInsideLetterbox = figures.every((f) => f.screen.top >= out.letterbox.barPx && f.screen.bottom <= size.y - out.letterbox.barPx);
  const r = document.querySelector('canvas').getBoundingClientRect();
  out.rect = { x: r.x, y: r.y, w: r.width, h: r.height };
  return out;
})()`;

const flags = ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio',
  '--allow-file-access-from-files', '--window-size=1000,760', '--remote-debugging-port=' + PORT,
  '--no-first-run', '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'item1256' }).catch(refusePortTaken);
let ws, result;
try {
  let wsUrl = null;
  for (let t = 0; t < 60 && !wsUrl; t++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const p = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch { /* coming up */ }
    if (!wsUrl) await sleep(250);
  }
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Page.navigate', { url: page });
  for (let t = 0; t < 100; t++) {
    if (await s.eval('!!(window.__pong && window.__pong.phase === "playing")').catch(() => false)) break;
    await sleep(100);
  }
  await sleep(2000);                      // the name card, the first serve, the figure files
  const timing = await s.eval(TIMING);
  const posed = await s.eval(POSE);
  await sleep(800);
  const probe = await s.eval(PROBE);
  const shot = await s.send('Page.captureScreenshot', { format: 'png',
    clip: { x: probe.rect.x, y: probe.rect.y, width: probe.rect.w, height: probe.rect.h, scale: 1 } });
  mkdirSync(SHOTS, { recursive: true });
  const png = path.join(SHOTS, LABEL + '.png');
  writeFileSync(png, Buffer.from(shot.data, 'base64'));
  result = { taken: new Date().toISOString(), label: LABEL, root: ROOT, timing, posed, probe, png };
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const out = path.join(HERE, LABEL + '.json');
writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
console.log(JSON.stringify({ timing: result.timing, posed: result.posed, names: result.probe.names,
  sheets: result.probe.sheets, files: result.probe.files, beats: result.probe.beats,
  figures: result.probe.figures, letterbox: result.probe.letterbox,
  figuresInsideLetterbox: result.probe.figuresInsideLetterbox }, null, 1));
console.log('wrote ' + out + ' and ' + result.png);
