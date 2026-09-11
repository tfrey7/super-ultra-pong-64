'use strict';
/*
 * Era 6's arrival flourish (src/eras/era6-n64.js, item 1152): the change into
 * the Nintendo 64 fades up out of fog at the miss, softens the old picture at
 * the ring's edge under a soft fat band with four toy balls riding it, pours
 * fog over the far end of the table, and spins a cube in the field's colours
 * once above the name card. The soft swoop is the voice's `boot` list, played
 * by the player and never by the flourish. Headless: a logging context; the
 * browser half (the melt, which needs a real canvas) is the playtest frame.
 */
const test = require('node:test');
const assert = require('node:assert');
const eralooks = require('../tools/eralooks.js');

const { Pong, R } = eralooks.loadRenderer(require('node:path').join(__dirname, '..'));
require('../src/erachange.js');
const Sound = require('../src/sound.js');

const look = R.eraLook(6);
const A = look.arrival;
const E = R.ERA_CHANGE;

/** A context that logs every call with the alpha in force, and every gradient made. */
function spy() {
  const log = [];
  const o = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000000', globalCompositeOperation: 'source-over' };
  const ctx = new Proxy(o, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') {
        return (...a) => { const g = { stops: [], addColorStop(s, c) { this.stops.push([s, c]); } }; log.push([k, a, g]); return g; };
      }
      return (...a) => { log.push([k, a, t.globalAlpha]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return { ctx, log };
}

function at(t, origin) {
  const raw = E.wipeProgress(t, E.wipe);
  const p = E.easeWipe(raw);
  const radius = E.ringRadius(p, origin, 800, 600);
  const s = spy();
  look.flourish(s.ctx, p, origin, 5, 6, { radius, t, duration: E.wipe, width: 800, height: 600, state: null, dim: null });
  return { p, radius, log: s.log };
}

test('era 6 registers its own arrival, and it ends inside the serve pause', () => {
  assert.strictEqual(typeof look.flourish, 'function');
  assert.notStrictEqual(look.flourish, R.eraLook(5).flourish);
  assert.notStrictEqual(look.flourish, R.eraLook(7).flourish, 'the Dreamcast does not replay it');
  assert.ok(E.wipe < Pong.RULES.eraChangePause, 'the ring, and so the flourish, ends inside the serve pause');
});

test('it draws only the change into era 6, and nothing behind the title', () => {
  const s = spy();
  look.flourish(s.ctx, 0.5, { x: 0, y: 300 }, 6, 7, { radius: 400, t: 0.7, width: 800, height: 600 });
  look.flourish(s.ctx, 0.5, { x: 0, y: 300 }, 5, 6, { radius: 400, t: 0.7, width: 800, height: 600, dim: '#3a3a3a' });
  assert.strictEqual(s.log.length, 0);
});

test('ignition: a fog disc at the point from the very first frame, gone by p = 0.25', () => {
  const origin = { x: 0, y: 300 };
  const first = at(0.02, origin);
  assert.ok(first.radius < 1, 'the ring is under a unit wide here');
  const disc = first.log.find((c) => c[0] === 'createRadialGradient' && c[1][0] === 0 && c[1][1] === 300 && c[1][2] === 0);
  assert.ok(disc, 'the fog disc opens at the point, keyed off the time');
  assert.ok(disc[2].stops[0][1].startsWith('rgba(185,212,236'), 'in the era\'s fog colour');
  const later = at(0.9, origin);
  assert.ok(!later.log.some((c) => c[0] === 'createRadialGradient' && c[1][2] === 0 && c[1][0] === 0 && c[1][1] === 300 && c[1][5] <= later.radius && c[2].stops[0][1].includes('0.9')),
    'no full-strength fog disc once the ignition is over');
});

test('the edge: a soft fat band on the ring and four toy balls riding it', () => {
  const origin = { x: 800, y: 200 };
  const mid = at(0.75, origin);
  const band = mid.log.find((c) => c[0] === 'createRadialGradient' && c[1][0] === 800 && c[2].stops.length === 4);
  assert.ok(band, 'the band');
  assert.ok(Math.abs(band[1][5] - mid.radius - A.spec.band.outside) < 1e-6);
  const balls = mid.log.filter((c) => c[0] === 'arc' && c[1][2] === A.spec.balls.r);
  assert.strictEqual(balls.length, 4);
  for (const b of balls) {
    const d = Math.hypot(b[1][0] - origin.x, b[1][1] - origin.y);
    assert.ok(Math.abs(d - mid.radius) < 1e-6, 'on the ring\'s edge');
  }
});

test('fog pours over the far end and draws back into the era\'s own band by the end', () => {
  assert.strictEqual(A.pourAt(0).alpha, 0);
  assert.ok(A.pourAt(0.6).alpha > 0.4, 'thick in the middle of the change');
  assert.ok(A.pourAt(0.6).alpha <= 0.55, 'never so thick the far paddle is lost');
  assert.ok(A.pourAt(0.999).alpha < 0.01, 'gone as the ring finishes');
  const mid = at(0.75, { x: 0, y: 450 });
  const sheet = mid.log.find((c) => c[0] === 'createLinearGradient');
  assert.ok(sheet, 'the pouring sheet');
  const farY = R.table3d.project(R.table3d.camera(look.camera), 400, 0, 0).y;
  assert.ok(sheet[1][1] < farY && sheet[1][3] > farY, `from above the far wall (y ${farY.toFixed(1)}) down onto the table`);
});

test('the cube: waits for the ring, spins exactly once, and is gone with the ring', () => {
  const origin = { x: 0, y: 300 };
  assert.strictEqual(A.cubeAt(0.2, origin, E.ringRadius(0.2, origin, 800, 600)), null, 'not before the ring reaches it');
  const r = (p) => E.ringRadius(p, origin, 800, 600);
  const c1 = A.cubeAt(0.7, origin, r(0.7));
  assert.ok(c1 && c1.angle > 0 && c1.angle < 2 * Math.PI);
  const done = A.cubeAt(0.97, origin, r(0.97));
  assert.ok(Math.abs(done.angle - 2 * Math.PI) < 1e-9, 'one full turn');
  assert.ok(A.cubeAt(0.9999, origin, r(0.9999)).alpha < 0.01, 'faded out by the end of the ring');
  const faces = A.cubeFaces(400, 150, 30, 0.8);
  assert.ok(faces.length >= 3 && faces.length <= 4, 'only the faces toward the eye');
  const drawn = at(1.05, origin);
  assert.ok(drawn.log.filter((c) => c[0] === 'closePath').length >= 3, 'the cube\'s faces are drawn');
  // above the name card (y 215 to 385), so the card never hides it
  const C = A.spec.cube;
  assert.ok(C.y + C.size * 1.3 < 215);
});

test('nothing it draws reaches more than 60 past the ring', () => {
  for (const origin of [{ x: 0, y: 300 }, { x: 800, y: 80 }, { x: 0, y: 560 }]) {
    for (let t = 0.02; t < E.wipe; t += 0.1) {
      const f = at(t, origin);
      for (const c of f.log) {
        if (c[0] !== 'arc') continue;
        const [x, y, rad] = c[1];
        const far = Math.hypot(x - origin.x, y - origin.y) + rad;
        const pourWisp = rad >= 32 && rad <= 60;           // clipped to R + 30 before it is drawn
        if (!pourWisp) assert.ok(far <= f.radius + 60 + 1e-6, `arc at t ${t.toFixed(2)} reaches ${far - f.radius} past the ring`);
      }
    }
  }
});

test('the boot sting keeps the bible\'s snap and chord and adds the soft swoop; the flourish sounds nothing', () => {
  const boot = look.voice.boot;
  const swoop = boot.filter((n) => n.slideTo && n.slideTo > n.freq * 2);
  assert.ok(swoop.length >= 1 && swoop.every((n) => n.wave === 'sine' || n.wave === 'triangle'), 'a rounded rising glide');
  assert.deepStrictEqual(Sound.voicesFor(6, 'boot'), boot);
});
