'use strict';
/*
 * Era 8, the 2000 PlayStation 2 (docs/ERAS.md chapter 9): letterbox bars with
 * the score as a subtitle, a drifting camera, a glossy slab with mirrored
 * paddles, dust, a glow trail, sparks off every hit and a lens flare -- and not
 * one rule different from any other era.
 *
 * The look draws with paths, gradients, transforms and composite modes, so
 * this file brings a canvas that records every fill with the state in force.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { Pong, R } = eralooks.loadRenderer(ROOT);
const T = R.table3d;
const PongSound = require('../src/sound.js');

const look = () => R.eraLook(8);
const fx = () => look().fx;

function canvas() {
  const ops = [];
  const st = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1, lineCap: 'butt',
    lineJoin: 'miter', globalCompositeOperation: 'source-over' };
  const stack = [];
  let subpaths = [];
  const gradient = (kind, args) => ({ kind, args, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } });
  const methods = {
    save() { stack.push(Object.assign({}, st)); },
    restore() { Object.assign(st, stack.pop()); },
    beginPath() { subpaths = []; },
    moveTo(x, y) { subpaths.push([[x, y]]); },
    lineTo(x, y) { if (!subpaths.length) subpaths.push([]); subpaths[subpaths.length - 1].push([x, y]); },
    arc(x, y, r) { subpaths.push([[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]); },
    closePath() {},
    clip() {},
    translate() {}, scale() {}, rotate() {},
    stroke() { ops.push({ op: 'stroke', style: st.strokeStyle, alpha: st.globalAlpha, comp: st.globalCompositeOperation }); },
    fill() { ops.push({ op: 'fill', style: st.fillStyle, alpha: st.globalAlpha, comp: st.globalCompositeOperation, subpaths: subpaths.map((p) => p.slice()) }); },
    fillRect(x, y, w, h) { ops.push({ op: 'fillRect', style: st.fillStyle, alpha: st.globalAlpha, comp: st.globalCompositeOperation, rect: [x, y, w, h] }); },
    createLinearGradient(...a) { return gradient('linear', a); },
    createRadialGradient(...a) { return gradient('radial', a); }
  };
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k in methods) return methods[k];
      if (k in t) return t[k];
      throw new Error(`the era 8 look used ctx.${String(k)}, which this recorder does not know`);
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return { ctx, ops };
}

function rally(overrides) {
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 8 });
  g.serveDelay = 0;
  g.score.left = 3;
  g.score.right = 11;
  g.ball.x = 412.5;
  g.ball.y = 340;
  g.ball.vx = 420;
  g.ball.vy = -180;
  g.left.y = 280;
  g.right.y = 410;
  g.time = 12.25;
  g.rally = 2;
  return Object.assign(g, overrides || {});
}

function frame(state, opts) {
  const c = canvas();
  R.draw(c.ctx, state, opts);
  return c.ops;
}

const rgbaOf = (css) => {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(css);
  return m ? { rgb: [+m[1], +m[2], +m[3]], a: +m[4] } : null;
};
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = ([r, g, b]) => r * 0.30 + g * 0.59 + b * 0.11;
const isBall = (o) => o.op === 'fill' && o.style === '#ffffff';
const inRgb = (hex) => (o) => typeof o.style === 'string' && o.style.startsWith(`rgba(${hexRgb(hex).join(',')},`);
const isSpark = (o) => o.op === 'fillRect' && o.comp === 'lighter';
const isGhost = (o) => o.op === 'fill' && o.comp === 'lighter' && o.subpaths.length === 1 && o.subpaths[0].length === 6;
const radialFrom = (hex, a) => (o) => o.op === 'fill' && o.style && o.style.kind === 'radial' &&
  o.style.stops[0][1] === `rgba(${hexRgb(hex).join(',')},${a.toFixed(3)})`;

/** Draw a run of frames 1/60 s apart, calling tweak(state, i) before each; the last frame's ops. */
function run(state, n, tweak) {
  let ops = null;
  for (let i = 0; i < n; i++) {
    if (tweak) tweak(state, i);
    ops = frame(state);
    state.time += 1 / 60;
    state.ball.x += state.ball.vx / 60;
    state.ball.y += state.ball.vy / 60;
  }
  return ops;
}

test('era 8 is the PlayStation 2, built rather than a placeholder, wearing the colours era 1 picked', () => {
  const l = look();
  assert.match(l.name, /PlayStation 2/);
  assert.ok(!l.placeholder, 'no longer a placeholder');
  assert.strictEqual(typeof l.draw, 'function');
  assert.deepStrictEqual(l.camera, { tilt: 30, height: 1250, fov: 29, screenY: 281 }, 'the bible camera at rest');
  assert.strictEqual(l.card.dots, null, 'no Super Nintendo buttons on the card');
  assert.notStrictEqual(typeof l.flourish, 'function', 'no borrowed arrival (era 1\'s): the flourish is a separate card');
  const g = rally();
  assert.strictEqual(R.paddleInk(g, 'left'), R.eraLook(1).paddleInk(g, 'left'));
  assert.strictEqual(R.paddleInk(g, 'right'), R.eraLook(1).paddleInk(g, 'right'));
});

test('drawing era 8 reads the state and never writes it, through a hit and a serve pause', () => {
  fx().reset();
  const g = rally();
  const before = JSON.stringify(g);
  frame(g);
  g.rally = 3; frame(g); g.rally = 2;
  g.serveDelay = 0.4; frame(g); g.serveDelay = 0;
  assert.strictEqual(JSON.stringify(g), before);
});

test('cinematic letterbox: 52-pixel black bars over everything, the score a subtitle in the top bar', () => {
  fx().reset();
  const g = rally();
  const ops = frame(g);
  const top = ops.findIndex((o) => o.op === 'fillRect' && o.style === '#000000' && o.rect.join() === '0,0,800,52');
  const bottom = ops.findIndex((o) => o.op === 'fillRect' && o.style === '#000000' && o.rect.join() === '0,548,800,52');
  assert.ok(top >= 0 && bottom >= 0, 'both bars');
  assert.ok(top > ops.findIndex(isBall), 'drawn after the ball');
  const subtitle = ops.slice(bottom).filter((o) => o.op === 'fillRect' && o.style === '#c9d6e8');
  assert.ok(subtitle.length > 10, 'the score is drawn in HUD ink after the bars');
  for (const o of subtitle) {
    assert.ok(Math.abs(o.alpha - 0.85) < 1e-9, 'at 0.85 opacity');
    assert.ok(o.rect[1] >= 16 && o.rect[1] + o.rect[3] <= 52, 'inside the top bar');
  }
  assert.ok(subtitle.some((o) => o.rect[0] < 400) && subtitle.some((o) => o.rect[0] > 400), 'both scores');
});

test('the camera drifts slowly and never past the measured extremes; the table stays inside the bars', () => {
  const pose = look().drift;
  assert.deepStrictEqual(pose(0), { tilt: 30, height: 1250, fov: 29, screenY: 281, panX: 0 });
  assert.notDeepStrictEqual(pose(3), pose(0), 'it moves');
  for (const k of ['tilt', 'panX', 'height']) assert.ok(fx().DRIFT[k].period >= 12, `${k} slower than 12 s a cycle (R7)`);
  for (let t = 0; t < 700; t += 0.37) {
    const p = pose(t);
    assert.ok(p.tilt >= 28.5 - 1e-9 && p.tilt <= 31.5 + 1e-9);
    assert.ok(p.panX >= -10 - 1e-9 && p.panX <= 10 + 1e-9);
    assert.ok(p.height >= 1210 - 1e-9 && p.height <= 1290 + 1e-9);
    const cam = T.camera(p);
    assert.ok(T.project(cam, 0, 0, 0).y >= 60 && T.project(cam, 800, 0, 0).y >= 60, `far edge below the top bar at t ${t}`);
    assert.ok(T.project(cam, 0, 600, 0).y <= 540, `near edge above the bottom bar at t ${t}`);
    // The flare's light never sits over the table: always above the far rail's top.
    const src = T.project(cam, ...fx().LIGHT);
    assert.ok(src.y < T.project(cam, src.x, -18, 22).y - 4 || src.y < T.project(cam, 400, 0, 22).y - 4,
      `the light is above the far rail at t ${t}`);
    assert.ok(src.x > 0 && src.x < 800, 'and on screen sideways');
  }
});

test('a paddle hit sprays a burst of 24 sparks, fanned away from the paddle, gone after 0.45 s', () => {
  fx().reset();
  const g = rally();
  frame(g);
  assert.strictEqual(frame(g).filter(isSpark).length, 0, 'no sparks before a hit');
  g.rally = 3;                                  // the rules counted a hit
  const hit = frame(g);
  const sparks = hit.filter(isSpark);
  assert.strictEqual(sparks.length, 24);
  const { C, SPARK } = fx();
  for (const s of sparks) {
    assert.ok(s.alpha <= 0.7 + 1e-9, 'opacity at most 0.7');
    assert.ok(lum(hexRgb(s.style)) < lum([255, 255, 255]), 'spark peak is not white (R1)');
    assert.strictEqual(s.rect[3], 2, 'a 2-pixel streak');
  }
  assert.strictEqual(sparks[0].style, C.spark, 'born at spark peak');
  // Later frames: the same sparks fade toward ember, then the pool is empty.
  g.time += 0.3;
  const later = frame(g).filter(isSpark);
  assert.strictEqual(later.length, 24);
  assert.ok(later.every((s) => s.style !== C.spark && s.alpha < 0.7), 'cooling and fading');
  g.time += SPARK.life;
  assert.strictEqual(frame(g).filter(isSpark).length, 0, 'burnt out');
});

test('sparks are deterministic, idempotent within a frame, and drawn from a fixed-size pool', () => {
  const burst = () => {
    fx().reset();
    const g = rally();
    frame(g);
    g.rally = 3;
    frame(g);
    g.time += 0.1;
    frame(g);                                   // drawing the same moment twice (the ring engine does)
    return frame(g).filter(isSpark);
  };
  assert.deepStrictEqual(burst(), burst());
  fx().reset();
  const g = rally();
  frame(g);
  for (let i = 0; i < 12; i++) { g.rally += 1; frame(g); }     // a flurry of hits in one instant
  assert.ok(fx().liveSparks(g.time) <= fx().SPARK.pool, 'never more than the pool');
  assert.strictEqual(frame(g).filter(isSpark).length, fx().SPARK.pool);
});

test('an alpha-glow trail of ten points and a halo sit behind a crisp white ball', () => {
  fx().reset();
  const g = rally();
  const ops = run(g, 14);
  const { C } = fx();
  const trail = ops.filter((o) => o.op === 'fill' && o.comp === 'lighter' && inRgb(C.glow)(o) && !isGhost(o));
  assert.strictEqual(trail.length, 10, 'the last ten ball points');
  for (const o of trail) assert.ok(rgbaOf(o.style).a <= 0.25 + 1e-9, 'at 0.25 or less');
  const halo = ops.findIndex(radialFrom(C.glow, 0.35));
  assert.ok(halo >= 0, 'a halo round the ball');
  const ball = ops.findIndex(isBall);
  assert.ok(ball > halo && ball > ops.lastIndexOf(trail[trail.length - 1]), 'the ball is drawn over its trail');
  assert.strictEqual(ops.filter(isBall).length, 1, 'one white core');
});

test('while the serve waits there is no ball, no trail and no halo', () => {
  fx().reset();
  const g = rally();
  run(g, 5);
  g.serveDelay = 0.5;
  const ops = frame(g);
  assert.strictEqual(ops.filter(isBall).length, 0);
  assert.strictEqual(ops.filter((o) => o.op === 'fill' && inRgb(fx().C.glow)(o) && o.comp === 'lighter' && !isGhost(o)).length, 0);
  assert.ok(ops.findIndex(radialFrom(fx().C.glow, 0.35)) < 0);
});

test('a lens flare: a blue source glow and five faint hexagon ghosts, alternating blue and amber', () => {
  fx().reset();
  const ops = frame(rally());
  const { C, FLARE } = fx();
  assert.ok(ops.findIndex(radialFrom(C.flare, FLARE.alpha)) >= 0, 'the source glow');
  const ghosts = ops.filter(isGhost);
  assert.strictEqual(ghosts.length, 5);
  ghosts.forEach((o, i) => {
    const c = rgbaOf(o.style);
    assert.deepStrictEqual(c.rgb, hexRgb(i % 2 ? C.amber : C.flare));
    assert.ok(c.a >= 0.08 - 1e-9 && c.a <= 0.14 + 1e-9, 'opacity 0.08 to 0.14 (R1)');
  });
  assert.ok(ops.indexOf(ghosts[4]) < ops.findIndex(isBall), 'under the ball');
  // It slides with the camera.
  const at = (time) => frame(rally({ time })).filter(isGhost).map((o) => o.subpaths[0][0]);
  assert.notDeepStrictEqual(at(2), at(9));
});

test('forty dust motes hang in the air, faint, and drift with time', () => {
  fx().reset();
  const { C } = fx();
  const motes = (time) => frame(rally({ time })).filter((o) => o.op === 'fill' && o.style === C.dust);
  const now = motes(4);
  assert.strictEqual(now.length, 40);
  for (const m of now) assert.ok(m.alpha >= 0.15 - 1e-9 && m.alpha <= 0.4 + 1e-9, 'opacity 0.15 to 0.4');
  fx().reset();
  assert.notDeepStrictEqual(motes(9).map((m) => m.subpaths), now.map((m) => m.subpaths));
});

test('a glossy slab with a sheen, and each paddle mirrored in it at 0.18 before the real paddles', () => {
  fx().reset();
  const g = rally();
  const ops = frame(g);
  const { C } = fx();
  const slab = ops.findIndex((o) => o.op === 'fill' && o.style === C.slab);
  const sheen = ops.findIndex((o) => o.op === 'fill' && o.style.kind === 'linear' && o.style.stops[0][1] === 'rgba(58,74,102,0.600)');
  assert.ok(slab >= 0 && sheen > slab, 'the slab, then its sheen');
  for (const side of ['left', 'right']) {
    const near = R.paddleInk(g, side);
    const mirrored = ops.findIndex((o) => o.op === 'fill' && o.style === near && Math.abs(o.alpha - 0.18) < 1e-9);
    const real = ops.findIndex((o) => o.op === 'fill' && o.style === near && o.alpha === 1);
    assert.ok(mirrored > sheen, `the ${side} reflection lies on the slab`);
    assert.ok(real > mirrored, `the real ${side} paddle stands over its reflection, at full strength (R4)`);
  }
});

test('R1: the white ball core is the brightest thing; every glow, spark, flare and mote stays under it', () => {
  fx().reset();
  const g = rally();
  run(g, 12);
  g.rally += 1;
  const ops = frame(g);
  const white = lum([255, 255, 255]);
  const ball = ops.findIndex(isBall);
  for (const o of ops.slice(0, ball)) {
    if (o.op !== 'fill' && o.op !== 'fillRect') continue;
    const colours = typeof o.style === 'string' ? [o.style] : o.style.stops.map((s) => s[1]);
    for (const css of colours) {
      const c = rgbaOf(css) || (css.startsWith('#') ? { rgb: hexRgb(css), a: 1 } : null);
      if (!c) continue;
      const opacity = c.a * o.alpha;
      if (opacity > 0.5) assert.ok(lum(c.rgb) < white, `${css} at ${opacity} would outshine the ball`);
      assert.notStrictEqual(css.toLowerCase(), '#ffffff', 'nothing but the ball is white');
    }
  }
  const bars = ops.findIndex((o) => o.op === 'fillRect' && o.rect && o.rect.join() === '0,0,800,52');
  assert.ok(ops.slice(ball + 1, bars).every((o) => o.op !== 'fill' || o.style === '#ffffff'), 'nothing is drawn over the ball but the bars');
});

test('behind the title (a dimmed frame) era 8 keeps the stock frame, so the title stays legible', () => {
  const g = rally();
  const got = eralooks.recorder();
  R.draw(got.ctx, g, { ink: '#3a3a3a' });
  const want = eralooks.recorder();
  R.drawBase(want.ctx, g, { ink: '#3a3a3a' });
  assert.deepStrictEqual(got.calls, want.calls);
});

test('era 8 plays exactly like era 1: drawing it every frame changes nothing about the game', () => {
  fx().reset();
  const seeded = () => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  const play = (era, drawEachFrame) => {
    const g = Pong.createGame({ rng: seeded(), phase: 'playing', era, rules: { eraChangePause: 0 } });
    const trail = [];
    let hits = 0;
    // The run climbs past era 8 into rungs other cards build (item 1186: the Xbox's
    // ctx.transform broke this test's strict recorder), so draw on the shared
    // recorder that takes any canvas call; this test is about the physics.
    const rec = eralooks.recorder();
    for (let i = 0; i < 2400; i++) {
      const pointerY = i < 1200 ? 300 + 220 * Math.sin(i / 35) : 20;
      Pong.step(g, 1 / 60, { pointerY, up: false, down: false });
      hits += g.events.filter((e) => e.type === 'paddle').length;
      if (drawEachFrame) { rec.calls.length = 0; R.draw(rec.ctx, g); }
      trail.push([g.ball.x, g.ball.y, g.ball.vx, g.ball.vy, g.left.y, g.right.y, g.score.left, g.score.right, g.serveDelay]);
    }
    return { trail, hits };
  };
  const one = play(1, false);
  const eight = play(8, true);
  assert.deepStrictEqual(eight.trail, one.trail);
  const [, , , , , , left, right] = one.trail[one.trail.length - 1];
  assert.ok(left + right >= 2, `the run crossed serves (score ${left}-${right})`);
  assert.ok(eight.hits >= 3, `and had paddle hits to spark (${eight.hits})`);
});

test('the voice is the bible\'s PlayStation 2: taiko thump on a hit, soft pads on a wall, a big cinematic hit on a point', () => {
  const v = look().voice;
  assert.deepStrictEqual(PongSound.voicesFor(8, 'paddle'), v.paddle, 'the sound hook plays the look\'s voice');
  assert.deepStrictEqual(PongSound.voicesFor(8, 'score'), v.score);
  assert.ok(v.paddle.some((n) => n.wave === 'sine' && n.freq <= 80 && n.slideTo < n.freq), 'a falling taiko thump');
  assert.ok(v.wall.every((n) => n.wave === 'sine' && n.attack >= 0.02), 'wall bounces are soft pads');
  assert.ok(v.score.some((n) => n.wave === 'sine' && n.freq <= 55 && n.gain >= 0.5), 'the big low hit');
  const pads = v.score.filter((n) => n.wave === 'sawtooth' && n.unison && n.unison.voices >= 5);
  assert.ok(pads.length >= 5, 'an orchestral chord of detuned pads');
  assert.ok(v.boot.length >= 3, 'the tower hum is ready for the boot sting');
  assert.deepStrictEqual(v.effects.reverb, { seconds: 2.8, decay: 3, mix: 0.35 }, 'a large hall');
  assert.strictEqual(PongSound.echoFor(8), null, 'no Super Nintendo slapback');
  for (const type of ['paddle', 'wall', 'score', 'boot']) {
    for (const n of v[type]) {
      assert.ok(['sine', 'triangle', 'sawtooth', 'square', 'noise'].includes(n.wave));
      assert.ok(n.gain > 0 && n.gain <= 0.5 && n.dur > 0);
    }
  }
});
