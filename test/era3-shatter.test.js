'use strict';
/*
 * Era 3's arrival: the NES picture shatters (the flourish in
 * src/eras/era3-genesis.js), with the Genesis sting under it (src/sound.js).
 * Headless: the shard set and each shard's pose are pure, and the hook is
 * driven through a real era change on a counting stand-in for the canvas.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');
const PongSound = require('../src/sound.js');

const { Pong, R } = eralooks.loadRenderer(path.join(__dirname, '..'));
require('../src/erachange.js');

const FRAME = 1 / 60;
const look = R.eraLook(3);
const S = look.shatter;

function playing(opts) {
  return Pong.createGame(Object.assign({ rng: () => 0.3, phase: 'playing' }, opts || {}));
}

/** The computer scores: the ball leaves the player's side at height y. */
function concede(g, y) {
  g.serveDelay = 0;
  g.ball.x = 1;
  g.ball.y = y;
  g.ball.vx = -400;
  g.ball.vy = 0;
  g.left.y = y > g.height / 2 ? 0 : g.height - g.left.h;
  Pong.step(g, 0.05, {});
}

/** A canvas stand-in that counts every method called on it. */
function countingCtx() {
  const counts = {};
  const target = {};
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => { counts[k] = (counts[k] || 0) + 1; return { addColorStop() {} }; };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return { ctx, counts };
}

const reachOf = (o) => R.ERA_CHANGE.ringReach(o, 800, 600);

test('era 3 registers the shatter as its arrival flourish', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  assert.ok(S && typeof S.shards === 'function' && typeof S.pose === 'function');
  assert.notStrictEqual(R.eraLook(2).flourish, look.flourish,
    'the shatter is era 3\'s own arrival, not a hook the NES carries');
});

test('the same point shatters the same way; another point breaks differently', () => {
  const a = { x: 0, y: 212 };
  const first = JSON.stringify(S.shards(a, 800, 600));
  S.shards({ x: 800, y: 40 }, 800, 600);            // push it out of the cache
  assert.strictEqual(JSON.stringify(S.shards(a, 800, 600)), first, 'rebuilt identically');
  assert.notStrictEqual(JSON.stringify(S.shards({ x: 0, y: 380 }, 800, 600)), first);
});

test('a fixed, bounded set of angular pieces, each a clip of the field it sits on', () => {
  for (const o of [{ x: 0, y: 300 }, { x: 800, y: 20 }, { x: 400, y: 300 }]) {
    const list = S.shards(o, 800, 600);
    assert.ok(list.length >= 40 && list.length <= 420, `${list.length} shards from ${o.x},${o.y}`);
    for (const s of list) {
      assert.ok(s.pts.length >= 6 && s.pts.length % 2 === 0, 'a polygon of at least three corners');
      const [bx, by, bw, bh] = s.box;
      assert.ok(bx >= 0 && by >= 0 && bw > 0 && bh > 0 && bx + bw <= 800 && by + bh <= 600,
        'its copy is taken from inside the field');
      assert.ok(s.near <= s.mid, 'the ring touches it before it breaks loose');
    }
  }
});

test('nothing moves before the ring reaches it, and every shard has flown by the end of the wipe', () => {
  for (const o of [{ x: 0, y: 150 }, { x: 800, y: 599 }, { x: 0, y: 300 }]) {
    const reach = reachOf(o);
    const list = S.shards(o, 800, 600);
    let flew = 0;
    for (const s of list) {
      assert.strictEqual(S.pose(s, s.near, reach), null, 'still whole until the ring arrives');
      let sawFly = false;
      for (let i = 1; i <= 400; i++) {
        const pose = S.pose(s, reach * i / 400, reach);
        if (pose && pose.phase === 'fly') sawFly = true;
      }
      if (sawFly) flew += 1;
      assert.strictEqual(S.pose(s, reach, reach), null, 'gone when the ring reaches the far corner');
      const last = S.pose(s, reach * 0.9995, reach);
      assert.ok(!last || last.scale < 0.02 || last.alpha < 0.02,
        'a breath before the end, anything still flying has all but vanished');
    }
    assert.ok(flew >= list.length * 0.9, `${flew} of ${list.length} shards broke loose and flew`);
  }
});

test('a loose shard spins, is thrown outward from the point and shrinks away', () => {
  const o = { x: 0, y: 300 };
  const reach = reachOf(o);
  const s = S.shards(o, 800, 600).find((x) => x.mid > 150 && x.mid < 400);
  const early = S.pose(s, s.mid + 20, reach);
  const late = S.pose(s, s.mid + 200, reach);
  assert.strictEqual(early.phase, 'fly');
  assert.ok(Math.abs(late.angle) > Math.abs(early.angle), 'it spins');
  const out = (p) => (s.cx + p.x - o.x) * (s.cx - o.x) + (s.cy + p.y - o.y) * (s.cy - o.y);
  assert.ok(out(late) > out(early), 'away from where the ball went out');
  assert.ok(late.scale < early.scale && late.scale < 1, 'shrinking');
});

test('through a real change from era 2 to 3 the hook draws shards during the ring and nothing after', () => {
  const g = playing({ era: 2 });
  concede(g, 300);
  assert.strictEqual(g.era, 3);
  const before = JSON.stringify(g);
  let most = 0;
  let wipingFrames = 0;
  let afterRotations = null;
  for (let i = 0; i < 200; i++) {
    const m = R.eraChangeMoment(g);
    if (!m) break;
    const { ctx, counts } = countingCtx();
    if (m.wiping) {
      const n = look.flourish(ctx, m.p, m.origin, m.from, m.era, {
        radius: m.radius, t: m.t, duration: m.duration, width: g.width, height: g.height,
        state: g, dim: null
      });
      if (m.p > 0.2 && m.p < 0.8) assert.ok(n > 0 && counts.rotate > 0, `shards on screen at p=${m.p.toFixed(2)}`);
      most = Math.max(most, n);
      wipingFrames += 1;
      if (i === 0) assert.strictEqual(JSON.stringify(g), before, 'drawing it never touches the state');
    } else if (afterRotations === null) {
      R.drawEraFrame(ctx, g);
      afterRotations = counts.rotate || 0;
    }
    Pong.step(g, FRAME, {});
  }
  assert.ok(wipingFrames >= 80, `${wipingFrames} frames of ring`);
  assert.ok(most >= 30, `up to ${most} shards in one frame`);
  assert.strictEqual(afterRotations, 0, 'once the ring has covered the field, not one shard is drawn');
});

test('the whole composite of a shattering frame draws cleanly, dimmed behind the title too', () => {
  const g = playing({ era: 2 });
  concede(g, 120);
  for (let i = 0; i < 40; i++) Pong.step(g, FRAME, {});
  const plain = countingCtx();
  assert.strictEqual(R.drawEraFrame(plain.ctx, g), true);
  assert.ok(plain.counts.rotate > 0 && plain.counts.stroke > 0);
  const dim = countingCtx();
  assert.doesNotThrow(() => R.drawEraFrame(dim.ctx, g, { ink: '#3a3a3a', card: false }));
});

test('the Genesis arrives on a bassy sting: FM bass under 100 Hz dropping in pitch, the bell over it', () => {
  const vs = PongSound.voicesFor(3, 'score');
  const bass = vs.filter((v) => v.freq < 100);
  assert.ok(bass.length >= 1, 'a bass voice');
  assert.ok(bass.every((v) => v.fm && v.slideTo && v.slideTo < v.freq), 'FM, and it drops');
  assert.ok(vs.some((v) => v.freq > 600), 'the bright bell stab rides over it');
  assert.ok(Math.max(...vs.map((v) => (v.at || 0) + v.dur)) < Pong.RULES.eraChangePause,
    'the sting is over inside the pause');
  // It is only ever heard as era 3 arrives: a point's note is the rung it moved up TO.
  const g = playing({ era: 2 });
  concede(g, 300);
  assert.deepStrictEqual(g.events.filter((e) => e.type === 'score').map((e) => e.era), [3]);
});
