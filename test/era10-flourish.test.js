'use strict';
/*
 * Era 10's arrival flourish (src/eras/era10-xbox360.js, item 1156), the
 * finale of the ladder: the change into the Xbox 360 plays as three beats --
 * an HDR white-out at the miss; dashboard blades riding the ring's edge across
 * the field with bloom and grain pouring in behind them; then the HUD blades
 * sliding home and the "100G · Top of the Ladder" achievement popping once the
 * ring has passed the centre -- under the voice's boot sting, whose blip is
 * timed to the pop. The sound player plays the sting, never the flourish.
 * Headless: the recorder is extended here to log what the hook draws; the
 * browser half is the playtest frame in the report.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
require('../src/erachange.js');
const Sound = require('../src/sound.js');

const FRAME = 1 / 60;
const look = R.eraLook(10);
const A = look.arrival;
const W = R.ERA_CHANGE;

/** A recorder that logs what is drawn, with the ink, alpha and composite in force. */
function logger() {
  const rec = eralooks.recorder();
  const ctx = rec.ctx;
  const log = [];
  let path = [];
  const mark = (op, extra) => log.push(Object.assign({ op, fill: ctx.fillStyle, stroke: ctx.strokeStyle,
    alpha: ctx.globalAlpha, comp: ctx.globalCompositeOperation || 'source-over' }, extra));
  ctx.beginPath = () => { path = []; };
  ctx.moveTo = (x, y) => path.push([x, y]);
  ctx.lineTo = (x, y) => path.push([x, y]);
  ctx.arc = (x, y, r) => path.push(['arc', x, y, r]);
  ctx.fill = () => mark('fill', { path: path.slice() });
  ctx.stroke = () => mark('stroke', { path: path.slice() });
  ctx.clip = (rule) => mark('clip', { path: path.slice(), rule });
  ctx.fillRect = (x, y, w, h) => mark('fillRect', { rect: [x, y, w, h] });
  ctx.fillText = (text) => mark('fillText', { text });
  return { ctx, log };
}

function hook(p, origin, info) {
  const { ctx, log } = logger();
  look.flourish(ctx, p, origin, 9, 10, Object.assign({ radius: 300, width: 800, height: 600, state: null, dim: null }, info));
  return log;
}

function era9Game() {
  return Pong.createGame({ rng: () => 0.3, phase: 'playing', era: 9 });
}

function concede(g, y) {
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = y === undefined ? g.height / 2 : y;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = g.ball.y > g.height / 2 ? 0 : g.height - g.left.h;
  Pong.step(g, 0.05, {});
}

test('era 10 registers the Xbox 360 arrival on its own look, and plays it only for itself', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  assert.ok(hook(0.5, { x: 0, y: 300 }).length > 0, 'draws for its own arrival');
  const other = [];
  const ctx = logger().ctx;
  ctx.fill = ctx.stroke = ctx.fillRect = () => other.push(1);
  look.flourish(ctx, 0.5, { x: 0, y: 300 }, 8, 9, { radius: 300, width: 800, height: 600, state: null, dim: null });
  assert.strictEqual(other.length, 0, 'called for another rung it draws nothing');
  assert.strictEqual(hook(0.5, { x: 0, y: 300 }, { dim: '#3a3a3a' }).length, 0, 'behind the title the plain ring plays');
});

test('beat 1: an HDR white-out at the miss, every wash at 0.35 or less, gone by p 0.25', () => {
  const early = hook(0.05, { x: 0, y: 300 }, { radius: 2 });
  const wash = early.find((o) => o.op === 'fillRect' && o.comp === 'screen');
  assert.ok(wash, 'a full-frame screen wash');
  assert.deepStrictEqual(wash.rect, [0, 0, 800, 600]);
  const a = Number(/,([\d.]+)\)$/.exec(wash.fill)[1]);
  assert.ok(a > 0.2 && a <= 0.35, `the wash is ${a}`);
  const burst = early.find((o) => o.op === 'fill' && o.comp === 'lighter' && o.path.some((q) => q[0] === 'arc' && q[3] === A.burst));
  assert.ok(burst, 'a bloom burst around the origin');
  const later = hook(0.3, { x: 0, y: 300 });
  assert.ok(!later.some((o) => o.comp === 'screen'), 'the eye has adapted by beat 2');
});

test('beat 2: the blades ride just inside the ring\'s edge, clipped to it, with bloom poured behind', () => {
  for (const [origin, dir] of [[{ x: 0, y: 300 }, 1], [{ x: 800, y: 120 }, -1]]) {
    for (const radius of [240, 480, 760]) {
      const log = hook(0.5, origin, { radius });
      const clip = log.find((o) => o.op === 'clip');
      assert.ok(clip && clip.path.some((q) => q[0] === 'arc' && q[3] === radius + 40), 'clipped to 40 past the ring');
      const panels = log.filter((o) => o.op === 'fill' && ['#5dc21e', '#d9dcd6', '#2f6b12'].includes(o.fill));
      assert.ok(panels.length >= 3, `${panels.length} panels at radius ${radius}`);
      for (const pnl of panels) {
        const bottom = pnl.path.filter((q) => q[1] === 600).map((q) => (q[0] - origin.x) * dir);
        assert.ok(Math.max(...bottom) <= radius, 'each panel inside the ring at the floor');
        assert.ok(Math.min(...bottom) >= 0, 'and on the far side of the origin');
        assert.ok(pnl.alpha > 0 && pnl.alpha <= 0.55);
      }
      // The leading panel sits at the edge itself.
      const lead = Math.max(...panels.flatMap((pnl) => pnl.path.filter((q) => q[1] === 600).map((q) => (q[0] - origin.x) * dir)));
      assert.ok(radius - lead < 10, `the lead panel ${radius - lead} behind the edge`);
      assert.ok(log.some((o) => o.op === 'fill' && o.comp === 'lighter'), 'bloom poured in behind them');
    }
  }
  // Near the end the panels fade out; at the very end nothing is left of them.
  const fading = hook(0.9, { x: 0, y: 300 }, { radius: 800 }).filter((o) => o.op === 'fill' && o.fill === '#5dc21e');
  assert.ok(fading.every((o) => o.alpha < 0.3));
  assert.strictEqual(hook(1, { x: 0, y: 300 }, { radius: 900 }).filter((o) => o.fill === '#5dc21e').length, 0);
});

test('the toast pops only after the ring has passed the centre, from any origin, and inside the serve pause', () => {
  const pause = Pong.createGame({}).rules.eraChangePause;
  let latest = 0;
  for (let x = 0; x <= 800; x += 100) {
    for (let y = 0; y <= 600; y += 100) {
      const o = { x, y };
      const centre = Math.hypot(400 - x, 300 - y);
      // The first time the ring's radius reaches the centre.
      let t = 0;
      while (W.ringRadius(W.easeWipe(W.wipeProgress(t, W.wipe)), o, 800, 600) < centre) t += 0.001;
      latest = Math.max(latest, t);
    }
  }
  assert.ok(latest < A.toastAt, `the ring passes the centre by ${latest.toFixed(3)} s, the toast pops at ${A.toastAt}`);
  assert.ok(A.toastAt + 0.25 < pause, 'and has slid in before the ball launches');
  assert.ok(A.bladesAt + 3 * A.bladeStagger + A.bladeSlide < pause, 'the HUD blades are home before the serve');
});

test('the boot sting is the Xbox 360 voice, and its blip lands with the toast', () => {
  const boot = Sound.voicesFor(10, 'boot');
  assert.deepStrictEqual(boot, look.voice.boot);
  const blip = boot.filter((v) => v.wave === 'sine' && (v.freq === 1175 || v.freq === 1568));
  assert.deepStrictEqual(blip.map((v) => v.at), [A.toastAt, A.toastAt + 0.07], 'the score blip\'s two tones, at the pop');
  assert.ok(boot.some((v) => v.wave === 'noise' && v.filter && v.filter.to), 'the whoosh');
});

test('through the real game: the change from era 9 plays the flourish, the toast and the sliding blades, and the paddles stay live', () => {
  const g = era9Game();
  concede(g);
  assert.strictEqual(g.era, 10);
  let calls = 0;
  const hookFn = look.flourish;
  look.flourish = function () { calls += 1; return hookFn.apply(this, arguments); };
  const texts = [];
  const ys = [];
  let bladesMoving = false;
  try {
    for (let i = 0; i < 200; i++) {
      const m = R.eraChangeMoment(g);
      if (!m) break;
      const { ctx, log } = logger();
      R.drawEraFrame(ctx, g, {});
      for (const o of log) if (o.op === 'fillText') texts.push(o.text);
      if (look.bladeSlide(g, 0) > 0 && look.bladeSlide(g, 0) < 200) bladesMoving = true;
      Pong.step(g, FRAME, { pointerY: 100 + i * 3, up: false, down: false });
      ys.push(g.left.y);
    }
  } finally { look.flourish = hookFn; }
  assert.ok(calls > 60, `the hook ran ${calls} frames`);
  assert.ok(texts.includes('100G · Top of the Ladder'), 'the achievement pops');
  assert.ok(texts.includes('ACHIEVEMENT UNLOCKED'));
  assert.ok(!texts.includes('50G - WELCOME TO HD'), 'climbing here is not the welcome');
  assert.ok(bladesMoving, 'the HUD blades slide in');
  assert.ok(ys[ys.length - 1] - ys[0] > 100, 'the paddle follows the hand through the whole change');
  assert.ok(g.serveDelay <= 0 || !R.eraChangeMoment(g), 'and it is over by the serve');
});
