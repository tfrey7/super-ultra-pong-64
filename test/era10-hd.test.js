// Era 10 in HD (item 1298): the render knobs it hands the 3D layer, and the one
// function that does its work inside the layer's shared scene -- era 9's setup
// first when there is one, then era 10's own warm rim light, added once.
//
// All of it headless: there is no document under node --test, so the layer
// itself declines and the era draws its canvas fallback. What is pinned here is
// the setup function's own behaviour against a stand-in scene.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');

const ROOT = path.join(__dirname, '..');
const { R } = eralooks.loadRenderer(ROOT);
const look = () => R.eraLook(10);

/** A stand-in for what PongField3D.internals() answers: a scene, a THREE, the parts. */
function stubLayer() {
  const added = [];
  const Light = function (colour, intensity) {
    this.colour = colour;
    this.intensity = intensity;
    this.name = '';
    this.color = { value: colour, set(v) { this.value = v; } };
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.target = { isTarget: true };
  };
  const mat = () => ({ roughness: 0.55, metalness: 0.05 });
  return {
    THREE: { DirectionalLight: Light },
    scene: { add(o) { added.push(o); } },
    camera: {},
    renderer: {},
    parts: {
      ballMat: mat(),
      bats: { left: { mat: mat(), blade: { scale: { y: 22 } } }, right: { mat: mat(), blade: { scale: { y: 22 } } } }
    },
    added
  };
}

const lights = (I) => I.added.filter((o) => o instanceof I.THREE.DirectionalLight);

function game(time) {
  return { time: time || 0, era: 10, left: { x: 20, y: 250, w: 12, h: 80 }, right: { x: 768, y: 250, w: 12, h: 80 } };
}

test('era 10 hands the layer its HD knobs: the picture over-rendered, filtered back down, standard lighting', () => {
  const knobs = look().render;
  assert.ok(knobs, 'era 10 sets render knobs');
  assert.equal(knobs.resolution, 1.2, 'renders 1.2 GL pixels per pixel of the picture');
  assert.equal(knobs.filter, true, 'sampled back into the picture smoothly, not blocky');
  assert.equal(knobs.lighting, 'standard', 'the lit material model');
  assert.equal(knobs.fog, undefined, 'no fog: the plaza haze is painted, not lit');
  // The picture era 10 lands in is 960 x 720 (src/display.js), so the layer's own
  // canvas is 1152 x 864 -- the eDRAM's anti-aliasing at 720p, in canvas terms.
  const row = require('../src/display.js').row(10);
  assert.deepEqual([row.w, row.h], [960, 720], 'the Xbox 360 picture is the 960 x 720 middle of 720p');
});

test('with no 3D layer at all, fieldSetup does nothing and answers null', () => {
  const setup = look().fieldSetup;
  assert.equal(typeof setup, 'function', 'the look carries one setup function');
  assert.equal(setup(null, game()), null, 'internals() answered null: nothing to set up');
  assert.equal(setup({}, game()), null, 'no scene, no THREE: still nothing');
  assert.equal(setup(undefined, undefined), null, 'and no state either');
});

test('the rim light is added ONCE, tagged, warm, low and behind the far wall', () => {
  const I = stubLayer();
  const setup = look().fieldSetup;
  const light = setup(I, game(0));
  assert.ok(light, 'it answers the light it added');
  assert.equal(lights(I).length, 1, 'one light added');
  assert.equal(light.name, 'era10-rim', 'tagged as era 10 s');
  assert.ok(I.added.includes(light.target), 'its target is in the scene, aimed at the middle of the table');
  assert.equal(light.color.value, '#ffd9a0', 'the warm colour of the HDR sun');
  assert.ok(light.position.z < -400, `behind the far wall (z ${light.position.z})`);
  assert.ok(light.position.y > 0 && light.position.y < 400, `low (y ${light.position.y})`);
  assert.ok(light.position.x > 0, 'on the sun s side of the plaza');
  assert.ok(light.intensity > 0, 'and it burns');

  const again = setup(I, game(1));
  assert.equal(again, light, 'the same light');
  assert.equal(lights(I).length, 1, 'a second frame adds no second light');
});

test('what moves every frame: the rim light breathes with the sun s bloom', () => {
  const I = stubLayer();
  const setup = look().fieldSetup;
  const seen = [];
  for (const t of [0, 1.5, 3, 4.5]) seen.push(setup(I, game(t)).intensity);
  assert.equal(lights(I).length, 1, 'still one light');
  assert.ok(seen[1] > seen[0] && seen[3] < seen[0], `it rises and falls: ${seen.map((v) => v.toFixed(3)).join(' ')}`);
  const spread = Math.max(...seen) / Math.min(...seen);
  assert.ok(spread > 1.05 && spread < 1.2, `by a tenth, not a flicker (${spread.toFixed(3)})`);
});

test('era 9 s own setup runs first when it has one, once per frame, and is not required', () => {
  const I = stubLayer();
  const setup = look().fieldSetup;
  const nine = R.eraLook(9);
  const had = Object.prototype.hasOwnProperty.call(nine, 'fieldSetup');
  assert.equal(had, false, 'era 9 has none today, and era 10 still works (the guard)');
  setup(I, game());
  assert.equal(lights(I).length, 1, 'era 10 s light went in all the same');

  const calls = [];
  nine.fieldSetup = function (layer, state) { calls.push({ layer, era: state && state.era }); };
  try {
    const J = stubLayer();
    setup(J, game());
    assert.equal(calls.length, 1, 'era 9 s setup ran exactly once');
    assert.equal(calls[0].layer, J, 'handed the same scene');
    assert.equal(calls[0].era, 10, 'and the frame s own state');
    setup(J, game(1));
    assert.equal(calls.length, 2, 'once a frame');
    assert.equal(lights(J).length, 1, 'and era 10 still adds only its own one light');
  } finally { delete nine.fieldSetup; }
});

test('the bats and the ball come out glossier than the ladder s default, so the rim light reads as an edge', () => {
  const I = stubLayer();
  look().fieldSetup(I, game());
  const mats = [I.parts.ballMat, I.parts.bats.left.mat, I.parts.bats.right.mat];
  for (const m of mats) {
    assert.ok(m.roughness < 0.55, `glossier than the default (${m.roughness})`);
    assert.ok(m.metalness > 0.05 && m.metalness < 0.3, `a touch of metal, not a mirror (${m.metalness})`);
  }
});

test('the era draws exactly as it did with no layer on the page: the canvas fallback is untouched', () => {
  // A whole frame through the recording canvas: it must not reach for the layer,
  // and nothing about the setup function may throw when there is no 3D at all.
  const Pong = require('../src/game.js');
  const g = Pong.createGame({ rng: () => 0.1, phase: 'playing', era: 10 });
  g.time = 2;
  const rec = eralooks.recorder();
  assert.doesNotThrow(() => look().draw(rec.ctx || rec, g, null, R), 'era 10 draws headless');
});
