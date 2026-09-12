// The real 3D layer (item 1273): its camera must put every field point on the
// very pixel src/table3d.js does, so the arenas painted around the table still
// line up; and with no WebGL (here, under node) the canvas table is what draws.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/table3d.js');
const F = require('../src/field3d.js');

const CAMERAS = [
  { tilt: 0, fov: 30 },
  { tilt: 38, height: 1150, fov: 30, screenY: 330 },
  { tilt: 52, height: 900, fov: 42, screenY: 360, panX: 14 },
  { tilt: 24, height: 1400, fov: 26, screenY: 280, panX: -30 },
  { tilt: 60, height: 700, fov: 50, screenY: 400 }
];

const POINTS = [[0, 0, 0], [800, 0, 0], [800, 600, 0], [0, 600, 0], [400, 300, 0],
  [120, 450, 22], [690, 80, 22], [400, 10, 60], [37, 590, 7.2], [800, -18, 22]];

test('the 3D camera lands every field point where table3d projects it', () => {
  for (const spec of CAMERAS) {
    const cam = T.camera(spec);
    const m = F.matrices(cam);
    for (const [x, y, z] of POINTS) {
      const want = T.project(cam, x, y, z);
      const got = F.projectThrough(m, x, y, z);
      assert.ok(Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.y - want.y) < 1e-6,
        `camera ${JSON.stringify(spec)} point ${[x, y, z]}: 3D ${got.x.toFixed(3)},${got.y.toFixed(3)} vs table3d ${want.x.toFixed(3)},${want.y.toFixed(3)}`);
    }
  }
});

test('the eras\' own cameras line up too', () => {
  const { loadRenderer } = require('../tools/eralooks.js');
  const P = loadRenderer(require('node:path').join(__dirname, '..')).R;
  let seen = 0;
  for (let era = 5; era <= 10; era++) {
    const spec = P.eraLook(era).camera;
    if (!spec) continue;
    seen++;
    const cam = T.camera(spec);
    const m = F.matrices(cam);
    for (const [x, y, z] of POINTS) {
      const want = T.project(cam, x, y, z);
      const got = F.projectThrough(m, x, y, z);
      assert.ok(Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.y - want.y) < 1e-6, `era ${era} point ${[x, y, z]}`);
    }
  }
  assert.ok(seen >= 1, 'at least one 3D era names its camera');
});

test('with no WebGL the layer declines and field() paints the canvas table', () => {
  assert.strictEqual(F.available(), false);
  assert.strictEqual(F.draw({}, T.camera({ tilt: 30 }), { era: 5 }, {}), false);
  const calls = [];
  const ctx = new Proxy({}, {
    get(o, k) { return k in o ? o[k] : (...a) => { calls.push(k); return { addColorStop() {} }; }; },
    set(o, k, v) { o[k] = v; return true; }
  });
  const cam = T.camera({ tilt: 38, height: 1150, fov: 30 });
  const drew = T.field(ctx, cam, { surface: '#203048' }, { era: 5 }, null);
  assert.strictEqual(drew, false);
  const tableCalls = calls.length;
  calls.length = 0;
  T.table(ctx, cam, { surface: '#203048' });
  assert.ok(tableCalls > 0 && tableCalls === calls.length, `field() fallback made ${tableCalls} calls, table() ${calls.length}`);
});

// Era 10 is the first era to set any (item 1298: HD). Eras 5 to 9 still take
// the defaults, and whatever an era does set is one of the four known knobs.
test('every era file draws its field through the layer, and any render knobs it sets are known ones', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'src', 'eras');
  const KNOBS = ['resolution', 'filter', 'fog', 'lighting'];
  const { R } = require('../tools/eralooks.js').loadRenderer(path.join(__dirname, '..'));
  for (const f of fs.readdirSync(dir).filter((n) => /^era([5-9]|10)-/.test(n))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(/T\.field\(/.test(src), `${f} draws its field through T.field`);
    const era = Number(f.match(/^era(\d+)/)[1]);
    const knobs = (R.eraLook(era) || {}).render;
    if (era < 10) assert.equal(knobs, undefined, `${f} sets no render knobs yet`);
    else assert.ok(knobs && typeof knobs === 'object', `${f} sets its render knobs`);
    for (const k of Object.keys(knobs || {})) assert.ok(KNOBS.includes(k), `${f} render knob ${k} is a known one`);
  }
});
