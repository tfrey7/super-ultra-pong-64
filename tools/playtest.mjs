/*
 * Playtest harness -- proves the game is actually PLAYABLE, in a real browser,
 * opened straight off disk. `node --test` proves the rules; this proves the
 * page: that it opens on a title screen with the ball held still, that a click
 * and a keypress each start it, that the mouse moves the paddle, that the keys
 * move the paddle, that rallies happen, that a miss scores, and that the serve
 * comes back to centre.
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
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(ROOT, 'docs', 'shots', 'playtest');

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
const CHROME = arg('chrome', CHROMES.find((p) => existsSync(p)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------- CDP plumbing
class Session {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    });
  }
  send(method, params = {}) {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
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
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOTS, { recursive: true });
    const file = path.join(SHOTS, name + '.png');
    writeFileSync(file, Buffer.from(r.data, 'base64'));
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
  phase: g.phase, time: g.time, serveDelay: g.serveDelay, rally: g.rally,
  score: { left: g.score.left, right: g.score.right },
  ball: { x: g.ball.x, y: g.ball.y, vx: g.ball.vx, vy: g.ball.vy },
  leftY: g.left.y, rightY: g.right.y, h: g.left.h, height: g.height, width: g.width
}; })()`);

/** What the page's sound player has done so far. It never changes the game. */
const sound = (s) => s.eval(`(() => { const p = window.__pongSound; return p ? {
  exists: true, unlocked: p.unlocked, available: p.available, played: p.played,
  errors: p.errors, last: p.last, audio: p.audioState(),
  hasAudioContext: typeof (window.AudioContext || window.webkitAudioContext) === 'function'
} : { exists: false }; })()`);

/** Where the canvas sits on screen, so we can aim the mouse at the field. */
const geometry = (s) => s.eval(`(() => {
  const b = document.getElementById('field').getBoundingClientRect();
  return { top: b.top, left: b.left, width: b.width, height: b.height };
})()`);

async function main() {
  if (!CHROME) throw new Error('No Chrome found; pass --chrome <path to chrome.exe>');
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') +
    (ERA ? '?era=' + encodeURIComponent(ERA) : '');
  // Never '.' as the fallback: that puts a Chrome profile in the repo root and dirties
  // the worktree. os.tmpdir() always answers, and honours TEMP/TMP when they are set.
  // One profile per debugging port, so two playtests on two ports can run at once.
  const profile = path.join(os.tmpdir(), 'pong-playtest-profile-' + PORT);

  const chrome = spawn(CHROME, [
    // --mute-audio: the audio graph still runs and is still checked, but a
    // playtest never beeps through the speakers of the machine it runs on.
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--window-size=1000,760', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    url
  ], { stdio: 'ignore' });

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
    await sleep(400);

    const geo = await geometry(s);
    const g0 = await state(s);
    const toClientY = (fieldY) => geo.top + (fieldY / g0.height) * geo.height;
    const midX = geo.left + geo.width / 2;

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
    await sleep(1200);
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

    // 6. Play properly for a while: track the ball with the mouse and rally.
    let shotTaken = false;
    const deadline = Date.now() + 22000;
    while (Date.now() < deadline) {
      const g = await state(s);
      await s.mouseTo(midX, toClientY(g.ball.y + 6));
      if (!shotTaken && g.rally >= 2 && g.serveDelay <= 0) {
        await s.shot('rally');
        shotTaken = true;
      }
      await sleep(45);
    }
    const gp = await state(s);
    check('rallies happen: the ball bounces off the paddles', gp.rally > 0 || gp.score.left > 0,
      `${gp.rally} hits in the current rally, score ${gp.score.left}-${gp.score.right}`);
    check('the player can score against the computer', gp.score.left > 0,
      `score after ~22s of tracking play: player ${gp.score.left}, computer ${gp.score.right}`);

    // 6b. The rally was heard (the key press after the reload unlocked it), and
    // every era's voice schedules on the real Web Audio API.
    const qr = await sound(s);
    check(NO_AUDIO ? 'with no audio device the rally plays silently, with no errors'
                   : 'hits and bounces make sound, in the era the machine is on',
      NO_AUDIO ? (qr.played === 0 && qr.errors === 0) : (qr.played > 0 && qr.errors === 0),
      `${qr.played} sounds, errors ${qr.errors}` +
        (qr.last ? `, last: ${qr.last.type} on era ${qr.last.era} (${qr.last.waves.join('+')}` +
          `${qr.last.echo ? ' + echo' : ''})` : ''));
    const voices = await s.eval(`(() => { const p = window.__pongSound; const out = [];
      for (let era = 0; era <= 4; era++) {
        const ok = p.play({ type: 'paddle', era: era });
        out.push({ era: era, ok: ok, last: ok ? p.last : null });
      }
      return { out: out, errors: p.errors }; })()`);
    check(NO_AUDIO ? 'and no era tries to sound' : 'every era\'s voice schedules in the browser',
      voices.errors === 0 && voices.out.every((v) => v.ok === !NO_AUDIO),
      voices.out.map((v) => `era ${v.era}: ` +
        (v.last ? v.last.waves.join('+') + (v.last.echo ? '+echo' : '') : 'silent')).join('; '));

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

    await s.mouseTo(midX, toClientY(gm2.ball.y + 6));
    await sleep(500);
    const scoreShot = await s.shot('scoreboard');
    console.log('\nscreenshots:');
    console.log('  ' + titleShot);
    console.log('  ' + firstFrameShot);
    if (shotTaken) console.log('  ' + path.join(SHOTS, 'rally.png'));
    console.log('  ' + scoreShot);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    try { ws && ws.close(); } catch { /* already gone */ }
    chrome.kill();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
