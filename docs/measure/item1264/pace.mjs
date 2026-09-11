/*
 * Item 1247: does the game's PACE -- not its frame time -- get slower across era
 * changes? Tim, playing the live game: "each time this thing transitions eras i
 * think it gets slower and slower". Item 1238 measured frame times (climbed eras
 * matched fresh ones) but never how fast the game MOVES per real second.
 *
 * Two readings of every era, as item 1238's climb.mjs takes them:
 *
 *   fresh   index.html?era=N, a new page for every era, started with a key
 *   climb   one page from the title, coin in, then one point per rung -- ten
 *           real era changes in a row, the way a match meets them
 *
 * Each reading starts at a serve (the ball at its serve speed, the moment it
 * leaves the centre) and samples every animation frame for SECONDS of real time,
 * with both paddles held on the ball from inside the page (set between rules
 * steps, so the rules never count it as a swing: no smashes). Per era it reports,
 * in player terms:
 *
 *   clock     game seconds the rules were handed per real second (1.00 = full
 *             pace; the rules' 50 ms frame cap, hit-stop and slow motion all
 *             show here, because each hands the rules less time)
 *   ball      the ball's distance travelled per real second, in table widths
 *             (field units / field width), and the same on screen, in screen
 *             widths, through the era's own 3D camera where it has one
 *   rules     the ball's speed per GAME second, in table widths, at the end
 *   stop/slow share of real time spent in hit-stop / match-point slow motion
 *   hits      paddle hits in the reading
 *   frame     mean real frame time, ms
 *
 * and, on the climb, the real time from each point to the next serve leaving
 * the centre (the era-change pause; the rules ask 1.8 s of game time).
 *
 *   node docs/measure/item1247/pace.mjs [--port 9481] [--no-gpu] [--seconds 5]
 *        [--size 1920,1080] [--label gpu-1920]
 *
 * GPU on by default (the brief's setup); --no-gpu draws in software like the
 * playtest. Writes pace-<label>.json beside itself.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : dflt; };
const PORT = Number(arg('--port', 9481));
const GPU = !process.argv.includes('--no-gpu');
const SECONDS = Number(arg('--seconds', 5));
const SIZE = arg('--size', '1920,1080');
const LABEL = arg('--label', (GPU ? 'gpu-' : 'sw-') + SIZE.split(',')[0]);
const ONLY = arg('--only', '');          // 'fresh' or 'climb'
const QUERY = arg('--query', '');        // extra query string, e.g. '&display=off'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text);
    }
    return r.result.value;
  }
}

async function waitFor(s, expr, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await s.eval(expr).catch(() => false)) return true;
    await sleep(25);
  }
  return false;
}

/**
 * One reading, all inside the page: waits for the serve to leave the centre,
 * then samples every frame for SECONDS of real time.
 */
function readingExpr(era, seconds) {
  return `new Promise((done) => {
  const g = window.__pong, R = window.PongRender, F = window.PongFeel;
  const cams = {};
  function screen(x, y) {
    const look = R.eraLook ? R.eraLook(g.era) : null;
    const T = look && look.camera ? R.table3d : null;
    if (!T) return { x, y };
    if (!cams[g.era]) cams[g.era] = T.camera(look.camera);
    const p = T.project(cams[g.era], x, y, g.ball.size / 2);
    return { x: p.x, y: p.y };
  }
  function hold() {
    for (const p of [g.left, g.right]) p.y = Math.max(0, Math.min(g.height - p.h, g.ball.y + g.ball.size / 2 + 6 - p.h / 2));
  }
  let phase = 'wait', t0 = 0, last = 0, time0 = 0, prev = null, prevS = null;
  const acc = { wall: 0, game: 0, dist: 0, sdist: 0, stop: 0, slow: 0, pause: 0, hits: 0, frames: 0, capped: 0, maxFrame: 0, long: [] };
  function tick(now) {
    hold();
    if (phase === 'wait') {
      // A serve, just leaving the centre, on this era.
      if (g.phase === 'playing' && g.era === ${era} && g.serveDelay <= 0) {
        phase = 'run'; t0 = last = now; time0 = g.time;
        prev = { x: g.ball.x, y: g.ball.y }; prevS = screen(g.ball.x + g.ball.size / 2, g.ball.y + g.ball.size / 2);
      }
      return requestAnimationFrame(tick);
    }
    const dt = now - last; last = now;
    acc.frames++; acc.wall += dt; if (dt > 50) { acc.capped++; acc.long.push({ ms: Math.round(dt), at: +((now - t0) / 1000).toFixed(2), conv: (window.__conv || []).length }); } if (dt > acc.maxFrame) acc.maxFrame = dt;
    const m = F ? F.moment(g) : { hitStop: 0, slow: false };
    if (m.hitStop > 5e-4) acc.stop += dt;
    if (m.slow) acc.slow += dt;
    if (g.serveDelay > 0) acc.pause += dt;
    for (const e of g.events || []) if (e.type === 'paddle') acc.hits++;
    const cur = { x: g.ball.x, y: g.ball.y };
    const curS = screen(g.ball.x + g.ball.size / 2, g.ball.y + g.ball.size / 2);
    const jump = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (jump < 80) {   // a point would teleport the ball to the centre; never counted
      acc.dist += jump;
      acc.sdist += Math.hypot(curS.x - prevS.x, curS.y - prevS.y);
    }
    prev = cur; prevS = curS;
    if (now - t0 < ${seconds * 1000} && g.era === ${era}) return requestAnimationFrame(tick);
    acc.game = g.time - time0;
    const speed = Math.hypot(g.ball.vx, g.ball.vy);
    done({ era: ${era}, ...acc, endSpeed: speed, width: g.width, score: g.score.left + g.score.right,
      matchPoint: !!(window.Pong.isMatchPoint && window.Pong.isMatchPoint(g)),
      canvasW: document.getElementById('field').width, dpr: window.devicePixelRatio });
  }
  requestAnimationFrame(tick);
})`;
}

function summarise(r) {
  const secs = r.wall / 1000;
  return {
    era: r.era,
    wallS: +secs.toFixed(2),
    clock: +(r.game / secs).toFixed(3),
    ballTablePerS: +(r.dist / r.width / secs).toFixed(3),
    ballScreenPerS: +(r.sdist / r.width / secs).toFixed(3),
    rulesSpeedTablePerGameS: +(r.endSpeed / r.width).toFixed(3),
    hitStopShare: +(r.stop / r.wall).toFixed(3),
    slowShare: +(r.slow / r.wall).toFixed(3),
    pauseShare: +(r.pause / r.wall).toFixed(3),
    hits: r.hits,
    frameMs: +(r.wall / Math.max(1, r.frames)).toFixed(2),
    maxFrameMs: +r.maxFrame.toFixed(1),
    framesOver50ms: r.capped,
    longFrames: r.long,
    score: r.score, matchPoint: r.matchPoint, canvasW: r.canvasW, dpr: r.dpr
  };
}

function line(kind, x) {
  return `${kind.padEnd(5)} era ${String(x.era).padStart(2)}: clock ${x.clock.toFixed(3)}  ball ${x.ballTablePerS.toFixed(3)} tables/s` +
    ` (screen ${x.ballScreenPerS.toFixed(3)})  rules ${x.rulesSpeedTablePerGameS.toFixed(3)}/game s` +
    `  hit-stop ${(x.hitStopShare * 100).toFixed(1)}%  slow ${(x.slowShare * 100).toFixed(1)}%  hits ${x.hits}` +
    `  frame ${x.frameMs} ms (max ${x.maxFrameMs}, >50ms ${x.framesOver50ms})` + (x.pauseS !== undefined ? `  pause before ${x.pauseS} s (ring max ${x.ringMaxFrameMs} ms)` : '');
}

async function startGame(s) {
  await s.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await s.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
}

async function fresh(s) {
  const rows = [];
  for (let era = 0; era <= 10; era++) {
    await s.send('Page.navigate', { url: `${base}?era=${era}${QUERY}` });
    await waitFor(s, '!!(window.__pong && window.PongFeel && document.getElementById("field"))', 10000);
    await sleep(600);
    await startGame(s);
    const x = summarise(await s.eval(readingExpr(era, SECONDS)));
    rows.push(x);
    console.log(line('fresh', x));
    if (x.longFrames.length) console.log('      long frames ' + JSON.stringify(x.longFrames));
  }
  return rows;
}

async function climb(s) {
  const rows = [];
  await s.send('Page.navigate', { url: base + (QUERY ? '?' + QUERY.replace(/^&/, '') : '') });
  await waitFor(s, '!!(window.__pong && window.PongFeel && document.getElementById("field"))', 10000);
  await sleep(900);
  await startGame(s);
  await waitFor(s, 'window.__pong.phase === "playing"', 3000);
  let pauseS, ringMax, ringLong;
  for (let rung = 0; rung <= 10; rung++) {
    const x = summarise(await s.eval(readingExpr(rung, SECONDS)));
    if (pauseS !== undefined) { x.pauseS = pauseS; x.ringMaxFrameMs = ringMax; x.ringLongFrames = ringLong; }
    rows.push(x);
    console.log(line('climb', x));
    if (x.longFrames.length) console.log('      long frames ' + JSON.stringify(x.longFrames));
    if (x.ringLongFrames && x.ringLongFrames.length) console.log('      ring long frames ' + JSON.stringify(x.ringLongFrames));
    if (rung === 10) break;
    // One point: the ball put just past the computer's paddle, heading out; then
    // the real time until the next serve leaves the centre.
    // Item 1264: the arrival itself (the ring and the name card, inside the serve
    // pause) is timed too, frame by frame, since the reading above starts only once
    // the serve leaves the centre. ringMaxFrameMs / ringLongFrames on the next row.
    const pause = await s.eval(`new Promise((done) => {
      const g = window.__pong, r = g.right;
      g.ball.x = r.x + r.w + 2; g.ball.y = g.height * 0.3; g.ball.vx = 600; g.ball.vy = 0;
      let t0 = null, last = null, max = 0; const long = [];
      function tick(now) {
        if (last !== null && t0 !== null) { const dt = now - last; if (dt > max) max = dt; if (dt > 50) long.push({ ms: Math.round(dt), at: +((now - t0) / 1000).toFixed(2) }); }
        last = now;
        if (t0 === null && g.era === ${rung + 1}) t0 = now;
        if (t0 !== null && g.serveDelay <= 0) return done({ s: +((now - t0) / 1000).toFixed(3), max: +max.toFixed(1), long });
        if (t0 === null || now - t0 < 8000) requestAnimationFrame(tick); else done({ s: -1, max: +max.toFixed(1), long });
      }
      requestAnimationFrame(tick);
    })`);
    pauseS = pause.s; ringMax = pause.max; ringLong = pause.long;
  }
  return rows;
}

const flags = ['--headless=new', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=' + SIZE, '--remote-debugging-port=' + PORT, '--no-first-run',
  '--no-default-browser-check', 'about:blank'];
if (!GPU) flags.unshift('--disable-gpu');
const chrome = await launchChrome(CHROME, flags, { name: 'pace1247' }).catch(refusePortTaken);
let ws;
const out = { taken: new Date().toISOString(), label: LABEL, gpu: GPU, size: SIZE, seconds: SECONDS, query: QUERY, fresh: [], climb: [] };
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
  // Counts only: how long each reverb's buffer takes to hand to a ConvolverNode (Chrome
  // prepares the whole impulse there, on the page's own thread), so a long frame can be
  // told apart from a first draw.
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const d = Object.getOwnPropertyDescriptor(ConvolverNode.prototype, 'buffer'); const log = window.__conv = [];
    Object.defineProperty(ConvolverNode.prototype, 'buffer', { configurable: true, get() { return d.get.call(this); },
      set(v) { const t = performance.now(); d.set.call(this, v); log.push({ ms: +(performance.now() - t).toFixed(1),
        len: v ? v.length : 0, era: window.__pong ? window.__pong.era : -1 }); } });
  })();` });
  const [w, h] = SIZE.split(',').map(Number);
  await s.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  if (ONLY !== 'fresh') { out.climb = await climb(s); out.climbConvolverSets = await s.eval('window.__conv'); console.log('convolver buffer sets on the climb: ' + JSON.stringify(out.climbConvolverSets)); }
  if (ONLY !== 'climb') out.fresh = await fresh(s);
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
if (out.fresh.length && out.climb.length) {
  console.log('\nera   clock fresh/climb   ball tables/s fresh/climb   hit-stop% fresh/climb   frame ms fresh/climb');
  for (let e = 0; e < out.climb.length; e++) {
    const f = out.fresh[e], c = out.climb[e];
    if (!f) continue;
    console.log(`${String(e).padStart(3)}   ${f.clock.toFixed(3)} / ${c.clock.toFixed(3)}       ${f.ballTablePerS.toFixed(3)} / ${c.ballTablePerS.toFixed(3)}` +
      `            ${(f.hitStopShare * 100).toFixed(1)} / ${(c.hitStopShare * 100).toFixed(1)}             ${f.frameMs} / ${c.frameMs}`);
  }
}
const file = path.join(HERE, `pace-${LABEL}.json`);
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log('wrote ' + file);
