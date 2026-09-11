/*
 * Playtest harness -- proves the game is actually PLAYABLE, in a real browser,
 * opened straight off disk. `node --test` proves the rules; this proves the
 * page: that it opens on a title screen with the ball held still, that a click
 * and a keypress each start it, that the mouse moves the paddle, that the keys
 * move the paddle, that rallies happen, that a miss scores, and that the serve
 * comes back to centre. Last, it walks one match up the whole era ladder --
 * a point per rung, a screenshot of each era in play, and one more point to
 * prove it stops at the top.
 *
 * No dependencies: it launches Chrome with a debugging port and drives it over
 * the DevTools protocol using Node's built-in WebSocket client (Node 22+).
 *
 *   node tools/playtest.mjs
 *   node tools/playtest.mjs --chrome "C:/path/to/chrome.exe" --port 9333
 *
 * Screenshots land in docs/shots/playtest/. This is a verification tool, not
 * part of the game: nothing in src/ knows it exists.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome } from './chrome.mjs';
import { CdpConnection, DroppedConnection } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(ROOT, 'docs', 'shots', 'playtest');
// The rules the page loads, read here too so the scoring hand can plan its
// shots against them (tools/scoring-rally.js). Nothing is changed by reading.
const require = createRequire(import.meta.url);
const Pong = require(path.join(ROOT, 'src', 'game.js'));
const Rally = require(path.join(HERE, 'scoring-rally.js'));

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', 9333));
// --era 3 opens the page at that rung of the ladder (index.html?era=3); every
// check below is about play, and holds at any era.
const ERA = arg('era', '');
// --no-audio takes AudioContext away from the page before it loads, the way a
// browser with no audio device would, and checks the game still plays silently.
const NO_AUDIO = process.argv.includes('--no-audio');
// --ladder runs only the walk up the era ladder (section 8), about 30 seconds.
const LADDER_ONLY = process.argv.includes('--ladder');
// --scoring runs only the rally and the scoring check (section 6), about ten
// seconds -- the quick way to ask "can the player still score?" many times.
const SCORING_ONLY = process.argv.includes('--scoring');
// --reference also copies the eleven era frames the walk takes (era0-arcade.png to
// era10-xbox360.png), and the ten frames it catches mid-change (change-era0-to-era1.png
// to change-era9-to-era10.png),
// into the TRACKED docs/shots/eras/, the reference pictures a reader opens. Off by default,
// because every walk's frames differ and a plain playtest must leave git clean.
const REFERENCE = process.argv.includes('--reference');
// --curve runs only the curved-shot check (item 1208), a few seconds; with
// --reference it also writes its film strip to the tracked docs/shots/paddle-physics/.
const CURVE_ONLY = process.argv.includes('--curve');
const ERA_SHOTS = path.join(ROOT, 'docs', 'shots', 'eras');
// One name per rung, the same as that era's file in src/eras/.
const ERA_NAMES = ['era0-arcade', 'era1-atari2600', 'era2-nes', 'era3-genesis', 'era4-snes',
  'era5-playstation', 'era6-n64', 'era7-dreamcast', 'era8-ps2', 'era9-xbox', 'era10-xbox360'];
const CHROME = arg('chrome', CHROMES.find((p) => existsSync(p)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Every screenshot written so far, for the summary of a run that stops part way.
const taken = [];

// ------------------------------------------------------------- CDP plumbing
// send() and the socket's end live in tools/cdp.mjs: when Chrome's connection
// closes, every waiting request is rejected rather than left hanging (item 1182).
class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    });
    // The exception's own description carries the message and the page's stack;
    // the bare text is only ever "Uncaught" (item 1187 lost a climb to that).
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error((e.exception && e.exception.description) || e.text);
    }
    return r.result.value;
  }
  mouseTo(x, y) {
    return this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  }
  async click(x, y) {
    const at = { x, y, button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at });
  }
  async reload() {
    await this.send('Page.reload', { ignoreCache: true });
    await sleep(700);
  }
  async key(type, code, key, vk) {
    await this.send('Input.dispatchKeyEvent', {
      type, code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk
    });
  }
  async shot(name, clip) {
    const r = await this.send('Page.captureScreenshot',
      clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' });
    mkdirSync(SHOTS, { recursive: true });
    const file = path.join(SHOTS, name + '.png');
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    taken.push(file);
    return file;
  }
}

async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* chrome is still coming up */ }
    await sleep(250);
  }
  throw new Error('Chrome never opened a debuggable page');
}

// ------------------------------------------------------------------- checks
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const state = (s) => s.eval(`(() => { const g = window.__pong; return {
  phase: g.phase, time: g.time, serveDelay: g.serveDelay, rally: g.rally, era: g.era, rules: g.rules,
  score: { left: g.score.left, right: g.score.right },
  ball: { x: g.ball.x, y: g.ball.y, vx: g.ball.vx, vy: g.ball.vy, spin: g.ball.spin, burst: g.ball.burst },
  leftY: g.left.y, rightY: g.right.y, h: g.left.h, height: g.height, width: g.width
}; })()`);

/** What the page's sound player has done so far. It never changes the game. */
const sound = (s) => s.eval(`(() => { const p = window.__pongSound; return p ? {
  exists: true, unlocked: p.unlocked, available: p.available, played: p.played,
  errors: p.errors, skipped: p.skipped, last: p.last, audio: p.audioState(),
  hasAudioContext: typeof (window.AudioContext || window.webkitAudioContext) === 'function'
} : { exists: false }; })()`);

/** Where the canvas sits on screen, so we can aim the mouse at the field. */
const geometry = (s) => s.eval(`(() => {
  const b = document.getElementById('field').getBoundingClientRect();
  return { top: b.top, left: b.left, width: b.width, height: b.height };
})()`);

// ----------------------------------------------------------- the era ladder
/** Play on for up to `ms`, the paddle aimed at aim(g), until done(g) says so. */
async function playUntil(s, geo, ms, aim, done) {
  const deadline = Date.now() + ms;
  let g = await state(s);
  while (Date.now() < deadline) {
    if (done && done(g)) return g;
    await s.mouseTo(geo.left + geo.width / 2, geo.top + (aim(g) / g.height) * geo.height);
    await sleep(45);
    g = await state(s);
  }
  return g;
}

/**
 * 6. Play a rally, then score against the computer. The hand is scripted, not
 * a plain ball-chase: a chase scores within 22 seconds only 44% of the time
 * (the computer is beatable by design, not that beatable), which made this
 * check a coin flip. tools/scoring-rally.js plans each incoming ball against
 * the page's own rules and stands where the return cannot be reached whatever
 * aim the computer rolls, so a point comes on the first shot -- and a FAIL here
 * means scoring really is broken, or the computer has been made unbeatable.
 * A slow early ball can still be caught, so it keeps shooting: it stops as soon
 * as the point and the rally picture are both in, and gives up after 45
 * seconds -- the window the sampler's 'scripted' row measures.
 */
async function playToScore(s, midX, toClientY) {
  const aim = Rally.createScorer(Pong);
  const started = Date.now();
  const deadline = started + 45000;
  let shotTaken = false;
  let gp = await state(s);
  while (Date.now() < deadline && !(gp.score.left > 0 && shotTaken)) {
    await s.mouseTo(midX, toClientY(aim(gp)));
    if (!shotTaken && gp.rally >= 2 && gp.serveDelay <= 0) {
      await s.shot('rally');
      shotTaken = true;
    }
    await sleep(45);
    gp = await state(s);
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  check('rallies happen: the ball bounces off the paddles', gp.rally > 0 || gp.score.left > 0,
    `${gp.rally} hits in the current rally, score ${gp.score.left}-${gp.score.right}`);
  check('the player can score against the computer', gp.score.left > 0,
    `score after ${secs}s of scripted play: player ${gp.score.left}, computer ${gp.score.right}; ` +
    `${aim.planned} returns planned against the rules, ${aim.certain} of them beyond every aim it can roll`);
  return { gp, shotTaken };
}

/**
 * 7. A curved shot (item 1208). The ball is sent flat at the player's paddle,
 * and the page's own mouse input swings the paddle down through it -- the
 * pointer is moved every frame so the paddle meets the ball dead centre while
 * travelling at `swing` units a second, which is a smash with spin on it. Then
 * the ball's flight is recorded frame by frame to the far side: it must leave
 * flat (the middle segment) and TURN, by at least 15 degrees, with no wall to
 * help it, and end well off the straight line it left on. Five frames of the
 * flight, the last with the path drawn over it, are stitched into a film strip.
 */
async function curveShot(s) {
  const out = await s.eval(`new Promise((done) => {
    const g = window.__pong, c = document.getElementById('field');
    const box = () => c.getBoundingClientRect();
    const point = (fy) => window.dispatchEvent(new MouseEvent('mousemove',
      { clientY: box().top + (fy / g.height) * box().height, clientX: box().left + 40 }));
    const Y = g.height / 2, swing = 520, face = g.left.x + g.left.w;
    g.serveDelay = 0;
    Object.assign(g.ball, { x: face + 150, y: Y - g.ball.size / 2, vx: -440, vy: 0, spin: 0, burst: 0 });
    const path = [], shots = [], hits = [];
    let t0 = null, walls = 0, frames = 0;
    const strip = document.createElement('canvas');
    const W = 320, H = 240, N = 5;
    strip.width = W * N; strip.height = H;
    const sx = strip.getContext('2d');
    function frame(now) {
      frames++;
      const b = g.ball, cy = b.y + b.size / 2;
      for (const e of g.events || []) { if (e.type === 'wall') walls++; if (e.type === 'paddle') hits.push(e); }
      if (b.vx < 0 && !hits.length) {
        // Before the hit: stand so the paddle arrives at Y exactly at contact.
        const tau = Math.max(0, (b.x - face) / -b.vx);
        point(Y - swing * Math.min(tau, 0.22));
      } else if (hits.length) {
        if (t0 === null) t0 = now;
        const t = (now - t0) / 1000;
        path.push({ t, x: b.x + b.size / 2, y: cy, vx: b.vx, vy: b.vy, spin: b.spin, walls });
        if (shots.length < N - 1 && t >= shots.length * 0.18) {
          sx.drawImage(c, shots.length * W, 0, W, H); shots.push(t);
        }
        if (b.vx < 0 || b.x > g.right.x - 30 || t > 1.6 || walls > 0) {
          // The last panel: this frame with the flight traced over it, and the
          // straight line it left on, dashed, for comparison.
          const k = W / g.width, ox = (N - 1) * W;
          sx.drawImage(c, ox, 0, W, H);
          const p0 = path[0], a0 = Math.atan2(p0.vy, p0.vx);
          sx.setLineDash([4, 4]); sx.strokeStyle = '#888'; sx.lineWidth = 2; sx.beginPath();
          sx.moveTo(ox + p0.x * k, p0.y * k);
          sx.lineTo(ox + (p0.x + Math.cos(a0) * 700) * k, (p0.y + Math.sin(a0) * 700) * k); sx.stroke();
          sx.setLineDash([]); sx.strokeStyle = '#ff3b3b'; sx.beginPath();
          path.forEach((p, i) => (i ? sx.lineTo : sx.moveTo).call(sx, ox + p.x * k, p.y * k)); sx.stroke();
          sx.strokeStyle = '#555'; sx.lineWidth = 2;
          for (let i = 1; i < N; i++) { sx.beginPath(); sx.moveTo(i * W, 0); sx.lineTo(i * W, H); sx.stroke(); }
          return done({ path, hit: hits[0], shots, png: strip.toDataURL('image/png'), frames });
        }
      }
      if (frames > 400) return done({ path, hit: hits[0] || null, shots, png: null, frames });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })`);
  const p = out.path;
  const hit = out.hit;
  check('a swinging paddle hits the ball: a smash with spin on it',
    !!hit && hit.smash === true && Math.abs(hit.spin) > 0.5,
    hit ? `smash ${hit.smash}, spin ${hit.spin.toFixed(2)} rad/s, speed ${hit.speed.toFixed(0)}` : 'the paddle never met the ball');
  if (!p.length) { check('a curved shot: the flight bends', false, 'no flight recorded'); return out; }
  // Measured up to the first wall, if the bend carried it into one.
  const clear = p.filter((q) => q.walls === 0);
  const first = p[0], last = clear.length ? clear[clear.length - 1] : p[0];
  const deg = (v) => Math.atan2(v.vy, Math.abs(v.vx)) * 180 / Math.PI;
  const a0 = Math.atan2(first.vy, first.vx);
  const off = Math.abs((last.y - first.y) * Math.cos(a0) - (last.x - first.x) * Math.sin(a0));
  const turned = Math.abs(deg(last) - deg(first));
  check('a curved shot: the flight bends, with no wall to help it',
    last.walls === 0 && turned >= 15 && off >= 40,
    `left at ${deg(first).toFixed(1)} deg, ${last.t.toFixed(2)}s later heading ${deg(last).toFixed(1)} deg ` +
    `(turned ${turned.toFixed(1)} deg), ${off.toFixed(0)} units off the straight line, ${last.walls} walls`);
  if (out.png) {
    const file = await (async () => {
      mkdirSync(SHOTS, { recursive: true });
      const f = path.join(SHOTS, 'curve-strip.png');
      writeFileSync(f, Buffer.from(out.png.split(',')[1], 'base64'));
      taken.push(f);
      return f;
    })();
    if (REFERENCE) {
      const dir = path.join(ROOT, 'docs', 'shots', 'paddle-physics');
      mkdirSync(dir, { recursive: true });
      copyFileSync(file, path.join(dir, 'curve-strip.png'));
    }
  }
  return out;
}

/**
 * Film the era change a point has just started, and check that it ran. Three
 * readings of the page's own ring (PongRender.eraChangeMoment): a frame taken
 * with the ring about half way; the ring's radius once the wipe has finished,
 * against the distance from where the ball went out to the farthest corner;
 * and, a frame later, the live canvas compared pixel by pixel with each of the
 * two eras drawn offscreen from the same state -- the new era has to be the one
 * on screen. The name card's band across the middle is left out of that count,
 * because the card sits over both until the serve.
 */
async function filmChange(s, clip, from) {
  const moment = () => s.eval(`(() => { const g = window.__pong;
    const m = window.PongRender.eraChangeMoment(g);
    if (!m) return null;
    const o = m.origin, dx = Math.max(o.x, g.width - o.x), dy = Math.max(o.y, g.height - o.y);
    return { from: m.from, era: m.era, p: m.p, wiping: m.wiping, radius: m.radius, width: g.width,
      corner: Math.sqrt(dx * dx + dy * dy), origin: { x: o.x, y: o.y } }; })()`);
  const out = { from, file: null, p: null, end: null, drawn: null };
  const deadline = Date.now() + 3000;
  let seen = false;
  while (Date.now() < deadline) {
    const m = await moment();
    if (!m) { if (seen) break; await sleep(8); continue; }
    seen = true;
    if (!out.file && m.wiping && m.p >= 0.4) {
      out.p = m.p;
      out.file = await s.shot(`change-era${from}-to-era${from + 1}`, clip);
    } else if (!m.wiping) { out.end = m; break; }
    else await sleep(8);
  }
  out.drawn = await s.eval(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const g = window.__pong, R = window.PongRender, D = window.PongDisplay;
    // With the display on, the frame to read is its native picture, before any
    // overlay; both eras are drawn for comparison at that same size and scale.
    const native = !!(D && D.enabled && D.canvas());
    const live = native ? D.canvas() : document.getElementById('field');
    const w = live.width, h = live.height, band = 90 * h / g.height;
    const pix = (c) => c.getContext('2d').getImageData(0, 0, w, h).data;
    const drawAs = (era) => (x) => R.draw(x, era === g.era ? g : Object.assign({}, g, { era: era }));
    const render = (era) => { if (native) return pix(D.render(D.shownEra(g), g.width, g.height, drawAs(era)));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      drawAs(era)(c.getContext('2d')); return pix(c); };
    const L = pix(live), N = render(${from + 1}), O = render(${from});
    let asNew = 0, asOld = 0, apart = 0, counted = 0;
    for (let y = 0; y < h; y++) {
      if (y >= h / 2 - band && y < h / 2 + band) continue;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4; counted++;
        if (L[i] !== N[i] || L[i + 1] !== N[i + 1] || L[i + 2] !== N[i + 2]) asNew++;
        if (L[i] !== O[i] || L[i + 1] !== O[i + 1] || L[i + 2] !== O[i + 2]) asOld++;
        if (N[i] !== O[i] || N[i + 1] !== O[i + 1] || N[i + 2] !== O[i + 2]) apart++;
      }
    }
    const m = R.eraChangeMoment(g);
    // A rung that borrows its neighbour's whole look (a like: N stand-in with no
    // draw of its own) draws the very same frame as the era it replaces, so
    // "closer to the new era than the old" cannot hold; when the two offscreen
    // frames are identical the live canvas only has to match the new era
    // exactly (items 1145-1150, 1179).
    done({ era: g.era, ring: !!(m && m.wiping), asNew: asNew, asOld: asOld, counted: counted, same: apart === 0 });
  })))`);
  return out;
}

/**
 * 8. Drive one match up the whole ladder the way a player meets it: a fresh
 * machine on era 0, then one point per rung. Each era is photographed, cropped
 * to the field, once its change moment has cleared and the ball is in play; a
 * last point at the top proves the ladder stops there.
 */
async function walkLadder(s, baseUrl) {
  // Always from a fresh era-0 machine, whatever --era opened the page at.
  await s.send('Page.navigate', { url: baseUrl });
  await sleep(900);
  const geo = await geometry(s);
  const clip = { x: geo.left, y: geo.top, width: geo.width, height: geo.height };
  const eras = await s.eval('window.Pong.ERAS.map((e) => e.year + " " + e.machine)');
  const points = (g) => g.score.left + g.score.right;
  const track = (g) => g.ball.y + 6;
  // Stand at the edge away from the ball so it goes past -- but stop choosing
  // once it is close, or the paddle sweeps across its path at the last moment.
  let edge = 30;
  // A ball with spin on it bends (item 1208), so the edge is chosen from where the
  // rules say it will ARRIVE, not from where it is now.
  const dodge = (g) => {
    if (g.ball.x > g.width * 0.35) {
      const at = g.ball.vx < 0 ? Rally.arrivalY(Pong, g) : null;
      edge = (at === null ? g.ball.y : at) < g.height / 2 ? g.height - 30 : 30;
    }
    return edge;
  };

  await s.key('keyDown', 'Space', ' ', 32);
  await s.key('keyUp', 'Space', ' ', 32);
  await sleep(150);
  const g0 = await state(s);
  check('the ladder walk starts a fresh match on era 0',
    g0.phase === 'playing' && g0.era === 0 && points(g0) === 0,
    `phase ${g0.phase}, era ${g0.era}, score ${g0.score.left}-${g0.score.right}`);

  const frames = [];
  const moves = [];
  const changes = [];
  for (let rung = 0; rung < eras.length; rung++) {
    // Wait out the serve pause -- the era change lives inside it -- then let
    // the ball get clear of the centre before the picture.
    await playUntil(s, geo, 4000, track, (g) => g.serveDelay <= 0);
    const g = await playUntil(s, geo, 500, track);
    const file = await s.shot('ladder-' + ERA_NAMES[rung], clip);
    frames.push({ rung, era: g.era, file });
    // One point either way moves the machine, and the ring starts where the ball
    // went out. Even changes are a real miss past the player (the ring starts on
    // the left); odd ones are the player's own point, the way a human climbs, so
    // the ring starts on the right. Beating the computer in a rally is a coin
    // flip, so the ball is put just past the computer's paddle, heading out --
    // outside the paddle, so it cannot be bounced back.
    const outRight = rung % 2 === 1;
    const before = points(g);
    if (outRight) await s.eval(`(() => { const g = window.__pong, r = g.right;
      g.ball.x = r.x + r.w + 2; g.ball.y = g.height * 0.3; g.ball.vx = 600; g.ball.vy = 0; })()`);
    const after = await playUntil(s, geo, 15000, outRight ? track : dodge, (x) => points(x) > before);
    moves.push({ from: g.era, to: after.era, scored: points(after) > before,
      score: `${after.score.left}-${after.score.right}` });
    // Below the top, that point started a change: film it while it plays.
    if (rung < eras.length - 1 && points(after) > before) {
      changes.push(Object.assign(await filmChange(s, clip, g.era), { want: outRight ? 'right' : 'left' }));
    }
  }

  check('each era is on screen when its frame is taken',
    frames.every((f) => f.era === f.rung),
    frames.map((f) => `frame ${f.rung}: era ${f.era}`).join('; '));
  const said = (m) => (m.scored ? `era ${m.from} -> ${m.to} at ${m.score}` : 'no point within 15 s');
  for (let i = 0; i < eras.length - 1; i++) {
    const m = moves[i];
    check(`point ${i + 1} moves the machine up one era, to the ${eras[i + 1]}`,
      m.scored && m.from === i && m.to === i + 1, said(m));
  }
  const top = moves[eras.length - 1];
  check(`and the ladder stops at the top: another point leaves it on the ${eras[eras.length - 1]}`,
    top.scored && top.from === eras.length - 1 && top.to === eras.length - 1, said(top));

  check(`every era change on the climb is filmed: ${eras.length - 1} of them`,
    changes.length === eras.length - 1 && changes.every((c) => c.file),
    changes.map((c) => `era ${c.from} -> ${c.from + 1}: ` +
      (c.file ? `caught at eased progress ${c.p.toFixed(2)}` : 'not caught mid-ring')).join('; '));
  // Where each ring started: the edge the ball went out of.
  const sideOf = (c) => (!c.end ? 'unseen' : c.end.origin.x >= c.end.width / 2 ? 'right' : 'left');
  const fromRight = changes.filter((c) => sideOf(c) === 'right').length;
  check(`era changes start from both edges: odd changes from the right (the player's point), even from the left`,
    changes.every((c) => sideOf(c) === c.want) && fromRight >= 2,
    changes.map((c) => `era ${c.from} -> ${c.from + 1}: from the ${sideOf(c)}`).join('; '));
  for (const c of changes) {
    const e = c.end, d = c.drawn;
    const reached = !!e && e.radius >= e.corner;
    const newDraws = d.era === c.from + 1 && !d.ring && (d.same ? d.asNew === 0 : d.asNew < d.asOld);
    check(`the change to the ${eras[c.from + 1]} ran from the ${sideOf(c)} edge: the ring reached the far corner and the new era draws afterwards`,
      !!c.file && reached && newDraws,
      (e ? `ring from ${e.origin.x.toFixed(0)},${e.origin.y.toFixed(0)} ended at radius ` +
        `${e.radius.toFixed(0)}, far corner ${e.corner.toFixed(0)}` : 'the ring was never seen to finish') +
      `; afterwards on era ${d.era}, ${d.asNew} of ${d.counted} pixels differ from era ${c.from + 1} ` +
      `drawn offscreen, ${d.asOld} from era ${c.from}` +
      (d.same ? ' (the two rungs draw the same frame, so only an exact match with the new era is asked)' : ''));
  }

  if (REFERENCE) {
    mkdirSync(ERA_SHOTS, { recursive: true });
    for (const f of frames) copyFileSync(f.file, path.join(ERA_SHOTS, ERA_NAMES[f.rung] + '.png'));
    for (const c of changes) if (c.file) copyFileSync(c.file, path.join(ERA_SHOTS, path.basename(c.file)));
  }
  return [...frames.map((f) => f.file), ...changes.filter((c) => c.file).map((c) => c.file)];
}

function summarise(shots) {
  console.log('\nscreenshots:');
  for (const f of shots) console.log('  ' + f);
  if (REFERENCE && CURVE_ONLY) console.log('the film strip was also copied to docs/shots/paddle-physics/curve-strip.png (tracked)');
  else if (REFERENCE) console.log(`the era frames and the mid-change frames were also copied to ${ERA_SHOTS} (tracked)`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
}

async function main() {
  if (!CHROME) throw new Error('No Chrome found; pass --chrome <path to chrome.exe>');
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') +
    // ?era=N alone opens straight into play (item 1207); title=on keeps the
    // cabinet so the title checks below still have a title to check.
    (ERA ? '?era=' + encodeURIComponent(ERA) + '&title=on' : '');
  // The profile is a fresh folder under the temp directory, deleted when Chrome
  // exits -- on success, on an error and on Ctrl+C (tools/chrome.mjs, item 1169) --
  // so two playtests on two ports never share one and none is left behind.
  const chrome = launchChrome(CHROME, [
    // --mute-audio: the audio graph still runs and is still checked, but a
    // playtest never beeps through the speakers of the machine it runs on.
    // --allow-file-access-from-files: the page is opened off disk, where Chrome
    // counts every image as another origin, so one drawImage of the pixel art
    // in assets/pixellab/ taints the canvas and the ladder walk's getImageData
    // throws. With it, a file:// page may read back its own files (item 1179).
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--allow-file-access-from-files',
    '--window-size=1000,760', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check',
    url
  ], { name: 'playtest' });
  // Named up front so a run that loses Chrome can say which process it was.
  console.log(`chrome: pid ${chrome.pid}, DevTools port ${PORT}`);

  let ws;
  try {
    ws = new WebSocket(await targetUrl());
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });
    const s = new Session(ws);
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    if (NO_AUDIO) {
      await s.send('Page.addScriptToEvaluateOnNewDocument', {
        source: 'delete window.AudioContext; delete window.webkitAudioContext;'
      });
      await s.reload();
    }
    // Wait for the page to actually be there -- the game and its field -- rather
    // than a fixed beat: on a busy machine 400 ms was sometimes not enough, and
    // the first read threw "Uncaught" before any check ran (item 1160).
    for (let i = 0; i < 100; i++) {
      const ready = await s.eval('!!(window.__pong && document.getElementById("field"))')
        .catch((e) => { if (e instanceof DroppedConnection) throw e; return false; });
      if (ready) break;
      await sleep(100);
    }
    await sleep(400);
    if (LADDER_ONLY) return summarise(await walkLadder(s, url.split('?')[0]));

    const geo = await geometry(s);
    const g0 = await state(s);
    const toClientY = (fieldY) => geo.top + (fieldY / g0.height) * geo.height;
    const midX = geo.left + geo.width / 2;

    if (CURVE_ONLY) {
      await s.key('keyDown', 'Space', ' ', 32);
      await s.key('keyUp', 'Space', ' ', 32);
      await sleep(150);
      await curveShot(s);
      return summarise([path.join(SHOTS, 'curve-strip.png')]);
    }

    if (SCORING_ONLY) {
      await s.key('keyDown', 'Space', ' ', 32);
      await s.key('keyUp', 'Space', ' ', 32);
      await sleep(150);
      const played = await playToScore(s, midX, toClientY);
      return summarise(played.shotTaken ? [path.join(SHOTS, 'rally.png')] : []);
    }

    // 1. The machine opens on its title screen, and stays there.
    const t0 = await state(s);
    await sleep(700);
    const t1 = await state(s);
    check('the game opens on the title screen', t1.phase === 'title',
      `phase is "${t1.phase}"`);
    check('and the ball holds still until someone starts it',
      t0.ball.x === t1.ball.x && t0.ball.y === t1.ball.y &&
        t1.score.left === 0 && t1.score.right === 0,
      `ball at ${t1.ball.x.toFixed(1)},${t1.ball.y.toFixed(1)} after 0.7s, ` +
      `score ${t1.score.left}-${t1.score.right}`);
    // Catch the invitation lit rather than mid-blink: a title shot without it
    // shows the reader a screen that never says how to start.
    // ...and past the cabinet's power-on warm-up (item 1207), so the shot is
    // the attract screen and not the tube still opening.
    for (let i = 0; i < 40; i++) {
      if (await s.eval('!window.__pongCabinet || window.__pongCabinet.stage(window.__pong) === "attract"')) break;
      await sleep(60);
    }
    for (let i = 0; i < 40; i++) {
      if (await s.eval('window.PongRender.promptLit(window.__pong)')) break;
      await sleep(60);
    }
    const titleShot = await s.shot('title');

    const q = await sound(s);
    check('the title screen is silent: no audio is opened before a click or key',
      q.exists && !q.unlocked && q.played === 0 && q.audio === 'none',
      `sound player ${q.exists ? 'loaded' : 'MISSING'}, unlocked ${q.unlocked}, ` +
      `${q.played} sounds, audio ${q.audio}` + (NO_AUDIO ? ', AudioContext removed' : ''));

    // 2. A click starts it -- then reload and prove a key does too.
    await s.click(midX, geo.top + geo.height / 2);
    await sleep(150);
    check('a click starts the game', (await state(s)).phase === 'playing',
      'clicked the field on the title screen');
    const qc = await sound(s);
    check(NO_AUDIO ? 'with no audio device the click opens nothing and throws nothing'
                   : 'and that click switches the sound on',
      NO_AUDIO ? (qc.unlocked && !qc.available && qc.errors === 0 && !qc.hasAudioContext)
               : (qc.unlocked && qc.available && qc.audio === 'running'),
      `unlocked ${qc.unlocked}, audio ${qc.audio}, errors ${qc.errors}`);

    await s.reload();
    check('a reload comes back to the title screen',
      (await state(s)).phase === 'title', 'the machine resets to its attract state');
    await s.key('keyDown', 'Space', ' ', 32);
    await s.key('keyUp', 'Space', ' ', 32);
    await sleep(150);
    check('and any key starts it too', (await state(s)).phase === 'playing',
      'pressed the space bar on the title screen');
    // Far enough past the serve pause that the ball is on its way: a shot
    // taken on the very first frame is an empty field, which proves nothing.
    // The coin moment (CREDIT 1, PLAYER 1 READY) holds the first serve too.
    await sleep(1200 + 1000 * (await s.eval('window.PongAttract ? window.PongAttract.COIN_HOLD : 0')));
    const firstFrameShot = await s.shot('first-frame');

    // 3. The loop is running at all.
    await sleep(600);
    const g1 = await state(s);
    check('the game loop advances in real time', g1.time > 0.3,
      `${g1.time.toFixed(2)}s of play elapsed`);

    // 4. The mouse places the player paddle.
    await s.mouseTo(midX, toClientY(120));
    await sleep(120);
    const gm = await state(s);
    const centre = gm.leftY + gm.h / 2;
    check('the mouse moves the player paddle', Math.abs(centre - 120) < 12,
      `paddle centre landed at ${centre.toFixed(0)}, aimed at 120`);

    // 5. The keys move the player paddle, both ways.
    const before = (await state(s)).leftY;
    await s.key('keyDown', 'ArrowUp', 'ArrowUp', 38);
    await sleep(350);
    await s.key('keyUp', 'ArrowUp', 'ArrowUp', 38);
    const afterUp = (await state(s)).leftY;
    check('the arrow keys move the paddle up', afterUp < before - 20,
      `moved from ${before.toFixed(0)} to ${afterUp.toFixed(0)}`);

    await s.key('keyDown', 'KeyS', 's', 83);
    await sleep(350);
    await s.key('keyUp', 'KeyS', 's', 83);
    const afterDown = (await state(s)).leftY;
    check('the S key moves the paddle down', afterDown > afterUp + 20,
      `moved from ${afterUp.toFixed(0)} to ${afterDown.toFixed(0)}`);

    // 6. Play a rally and score against the computer (playToScore, above).
    const { gp, shotTaken } = await playToScore(s, midX, toClientY);

    // 6b. The rally was heard (the key press after the reload unlocked it), and
    // every era's voice schedules on the real Web Audio API.
    const qr = await sound(s);
    check(NO_AUDIO ? 'with no audio device the rally plays silently, with no errors'
                   : 'hits and bounces make sound, in the era the machine is on',
      NO_AUDIO ? (qr.played === 0 && qr.errors === 0) : (qr.played > 0 && qr.errors === 0),
      `${qr.played} sounds, errors ${qr.errors}` +
        (qr.last ? `, last: ${qr.last.type} on era ${qr.last.era} (${qr.last.waves.join('+')}` +
          `${qr.last.echo ? ' + echo' : ''})` : ''));
    // Every sound each era has -- hit, wall, point and, where the voice carries
    // one, the arrival sting -- so every note field and effect of the 3D eras'
    // grammar (noise, filters, unison, tremolo, drive, reverb, bus) is built on
    // the real Web Audio API, and none of it is skipped for want of a node.
    const voices = await s.eval(`(() => { const p = window.__pongSound; const out = [];
      const S = window.PongSound;
      for (let era = 0; era <= window.Pong.TOP_ERA; era++) {
        const types = ['paddle', 'wall', 'score'];
        let ok = true; let n = 0;
        for (const type of types) { if (p.play({ type: type, era: era })) n += 1; else ok = false; }
        const last = p.last;
        if (S.voicesFor(era, 'boot').length) {
          p.handle({ era: era, eraChangedAt: 1e9 + era, events: [{ type: 'score', era: era, time: 1e9 + era }] });
          if (p.last && p.last.type === 'boot') n += 1; else ok = false;
        }
        out.push({ era: era, ok: ok, n: n, last: ok ? last : null });
      }
      return { out: out, errors: p.errors, skipped: p.skipped }; })()`);
    check(NO_AUDIO ? 'and no era tries to sound' : 'every era\'s voice schedules in the browser, every sound, nothing skipped',
      voices.errors === 0 && voices.skipped === 0 &&
        voices.out.every((v) => v.ok === !NO_AUDIO),
      `errors ${voices.errors}, skipped ${voices.skipped}; ` + voices.out.map((v) => `era ${v.era}: ` +
        (v.last ? v.n + ' sounds, ' + [...new Set(v.last.waves)].join('+') + (v.last.echo ? '+echo' : '') +
          (v.last.reverb ? '+reverb' : '') + (v.last.bus ? '+bus' : '') : 'silent')).join('; '));

    // 6c. A curved shot off a swinging paddle (curveShot, above; item 1208).
    await curveShot(s);

    // 7. Miss on purpose: park the paddle in a corner and let one through.
    const missDeadline = Date.now() + 15000;
    const conceded = gp.score.right;
    let sawCentreServe = false;
    while (Date.now() < missDeadline) {
      await s.mouseTo(midX, toClientY(20));
      const g = await state(s);
      if (g.score.right > conceded) {
        const gs = await state(s);
        sawCentreServe = Math.abs(gs.ball.x - (gs.width - 12) / 2) < 1 &&
                         Math.abs(gs.ball.y - (gs.height - 12) / 2) < 1;
        break;
      }
      await sleep(45);
    }
    const gm2 = await state(s);
    check('a missed ball scores for the computer', gm2.score.right > conceded,
      `computer went from ${conceded} to ${gm2.score.right}`);
    check('and the next serve restarts from the centre', sawCentreServe,
      sawCentreServe ? 'ball re-centred' : 'did not observe the reset');

    // 7b. An era change, forced: one point from the player's side at a known
    // height, then the ring must play at full frame rate while the hand keeps
    // moving the paddle. Frame timing is the page's own rAF clock, taken over
    // ordinary play first and then over the ring.
    const forcePoint = () => s.eval(`(() => { const g = window.__pong; const P = window.Pong;
      if (g.era >= P.TOP_ERA) g.era = P.TOP_ERA - 1;   // room to climb one more rung
      g.startEra = 0;
      g.serveDelay = 0; g.ball.x = -8; g.ball.y = 150; g.ball.vx = -600; g.ball.vy = 0;
      return g.era; })()`);
    const frameTiming = (ms) => s.eval(`new Promise((done) => {
      const stamps = [], ys = [], ring = []; const t0 = performance.now();
      function tick(now) {
        const g = window.__pong; const m = window.PongRender.eraChangeMoment(g);
        stamps.push(now); ys.push(g.left.y); ring.push(!!(m && m.wiping));
        if (now - t0 < ${ms}) requestAnimationFrame(tick); else done({ stamps, ys, ring });
      }
      requestAnimationFrame(tick);
    })`);
    const frameStats = (stamps) => {
      const d = [];
      for (let i = 1; i < stamps.length; i++) d.push(stamps[i] - stamps[i - 1]);
      d.sort((a, b) => a - b);
      const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
      return { frames: d.length, mean, p95: d[Math.floor(d.length * 0.95)] || 0, max: d[d.length - 1] || 0 };
    };
    const fmtMs = (v) => v.toFixed(1) + ' ms';

    await s.mouseTo(midX, toClientY(540));
    const baseline = frameStats((await frameTiming(1000)).stamps);
    const fromEra = await forcePoint();
    await sleep(30);
    const timing = frameTiming(1450);
    for (let i = 0; i < 26; i++) {
      await s.mouseTo(midX, toClientY(i % 2 ? 500 : 110));
      await sleep(50);
    }
    const ringRun = await timing;
    const ringStamps = ringRun.stamps.filter((_, i) => ringRun.ring[i]);
    const during = frameStats(ringStamps);
    const ringYs = ringRun.ys.filter((_, i) => ringRun.ring[i]);
    const travel = ringYs.length ? Math.max(...ringYs) - Math.min(...ringYs) : 0;
    const toEra = await s.eval('window.__pong.era');
    check('an era change plays its ring at full frame rate',
      during.frames >= 40 && during.mean <= Math.max(baseline.mean * 1.25, 18.5),
      `era ${fromEra} to ${toEra}: ${during.frames} ring frames, mean ${fmtMs(during.mean)}, ` +
      `p95 ${fmtMs(during.p95)}, max ${fmtMs(during.max)}; ordinary play just before: ` +
      `mean ${fmtMs(baseline.mean)}, p95 ${fmtMs(baseline.p95)}, max ${fmtMs(baseline.max)}`);
    check('and the paddle stays in the player\'s hands while it plays', travel > 150,
      `the paddle travelled ${travel.toFixed(0)} field units during the ring`);

    // The picture: a second forced point, captured with the ring about half way.
    await sleep(600);
    await s.mouseTo(midX, toClientY(430));
    const shotFrom = await forcePoint();
    let wipeAt = null;
    for (let i = 0; i < 150 && wipeAt === null; i++) {
      const p = await s.eval('(() => { const m = window.PongRender.eraChangeMoment(window.__pong); ' +
        'return m && m.wiping ? m.p : null; })()');
      if (p !== null && p >= 0.4) wipeAt = p;
      else await sleep(8);
    }
    const wipeShot = await s.shot('era-wipe');
    console.log(`      mid-wipe shot: era ${shotFrom} to ${shotFrom + 1}, eased progress ` +
      `${wipeAt === null ? 'not caught' : wipeAt.toFixed(2)} when the capture was asked for`);

    await s.mouseTo(midX, toClientY(gm2.ball.y + 6));
    await sleep(500);
    const scoreShot = await s.shot('scoreboard');

    // 8. One whole match up the ladder, era by era.
    const ladderShots = await walkLadder(s, url.split('?')[0]);
    summarise([titleShot, firstFrameShot,
      ...(shotTaken ? [path.join(SHOTS, 'rally.png')] : []), wipeShot, scoreShot, ...ladderShots]);
  } catch (e) {
    // A run that stops part way is a FAIL with its summary, never a quiet exit:
    // Chrome's connection dropping (tools/cdp.mjs) is the case this was built for
    // (item 1182). The finally below still closes Chrome and deletes its profile.
    const dropped = e instanceof DroppedConnection;
    check(dropped ? 'Chrome\'s DevTools connection stays open until the run ends'
                  : 'the playtest runs to the end without an error', false, e.message);
    if (!dropped) console.error(e);
    summarise(taken);
  } finally {
    try { ws && ws.close(); } catch { /* already gone */ }
    await chrome.close();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
