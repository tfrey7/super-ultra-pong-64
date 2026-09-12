'use strict';
/*
 * Era 6 on the real 3D layer (item 1292): Super Mario 64's blob shadows ADDED,
 * the Nintendo 64's smear as the CHANGE. Headless: the knobs and the disc
 * positions are pure, and fieldSetup is driven against a real three.js scene
 * (vendor/three.js needs no WebGL to build meshes), with the scene's own
 * onBeforeRender called by hand where the renderer would call it.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const eralooks = require('../tools/eralooks.js');
const T = require('../src/table3d.js');
const F = require('../src/field3d.js');

const ROOT = path.join(__dirname, '..');
const { R } = eralooks.loadRenderer(ROOT);
require('../vendor/three.js');
const THREE = globalThis.THREE;

const look = R.eraLook(6);
const X = look.field3d;

function stateAt(leftY, rightY, ball) {
  return {
    width: 800, height: 600, era: 6, serveDelay: 0, time: 1,
    left: { x: 20, y: leftY, w: 12, h: 90 },
    right: { x: 768, y: rightY, w: 12, h: 90 },
    ball: Object.assign({ x: 393, y: 293, size: 14 }, ball || {})
  };
}

/** The view depth of a field row, the way THREE.Fog measures it, from field3d's own matrices. */
function depthThrough(cam, fieldY) {
  const m = F.matrices(cam);
  const fwd = [0, Math.sin(m.rotX), -Math.cos(m.rotX)];     // the camera's -z after the turn about x
  const p = [0 - m.eye[0], 0 - m.eye[1], fieldY - 300 - m.eye[2]];
  return p[0] * fwd[0] + p[1] * fwd[1] + p[2] * fwd[2];
}

test('era 6 sets the N64 render knobs: 320 x 240 in its buffer, filtered, fogged over the canvas band, lambert', () => {
  const r = look.render;
  assert.ok(r, 'R.eraLook(6).render exists');
  assert.strictEqual(r.resolution, 0.8);
  assert.strictEqual(400 * r.resolution, 320, 'the 400 x 300 world buffer at 0.8 is the machine\'s 320 x 240');
  assert.strictEqual(300 * r.resolution, 240);
  assert.strictEqual(r.filter, true);
  assert.strictEqual(r.lighting, 'lambert');
  assert.strictEqual(r.fog.colour, look.fog.colour);
  // near and far: the canvas band's start (0.25) and end (0.85) of the table as camera distances
  const cam = T.camera(look.camera);
  const near = depthThrough(cam, 600 - look.fog.start * 600);
  const far = depthThrough(cam, 600 - look.fog.end * 600);
  assert.ok(Math.abs(r.fog.near - near) <= 0.5, `near ${r.fog.near} against ${near.toFixed(1)}`);
  assert.ok(Math.abs(r.fog.far - far) <= 0.5, `far ${r.fog.far} against ${far.toFixed(1)}`);
  assert.ok(r.fog.near < depthThrough(cam, 300) && depthThrough(cam, 300) < r.fog.far, 'mid-court sits inside the fog ramp');
  // no earlier 3D era sets a lighting model of its own: this is the ladder's change
  assert.ok(!(R.eraLook(5).render && R.eraLook(5).render.lighting === 'lambert'));
});

test('the three discs follow the state: players at the foot spot on the floor, the ball under itself, at three paddle heights', () => {
  const floor = F.SIZES.legs.floor;
  assert.strictEqual(floor, -110);
  for (const [ly, ry] of [[0, 510], [255, 255], [510, 0]]) {
    const s = X.blobSpots(stateAt(ly, ry), floor);
    assert.deepStrictEqual([s.left.x, s.left.y, s.left.z], [-30, ly + 45, -110], `left at paddle y ${ly}`);
    assert.deepStrictEqual([s.right.x, s.right.y, s.right.z], [830, ry + 45, -110], `right at paddle y ${ry}`);
    assert.deepStrictEqual([s.ball.x, s.ball.y], [400, 300]);
    assert.ok(s.ball.z > 0 && s.ball.z < 0.6, 'the ball\'s disc lies on the top, under the contact shadow');
    for (const k of ['left', 'right', 'ball']) {
      assert.strictEqual(s[k].opacity, 0.35);
      assert.ok(s[k].opacity < F.SIZES.shadow, 'R5: lighter than the ball\'s contact shadow');
    }
  }
  // past an end the ball's disc drops to the floor; in the serve pause it is hidden with the ball
  assert.strictEqual(X.blobSpots(stateAt(0, 0, { x: -40 }), floor).ball.z, -110);
  const serving = stateAt(0, 0);
  serving.serveDelay = 0.5;
  assert.strictEqual(X.blobSpots(serving, floor).ball.shown, false);
  // no floor in the layer: the players' discs sit on the top's ends
  const bare = X.blobSpots(stateAt(100, 200), null);
  assert.deepStrictEqual([bare.left.x, bare.left.z, bare.right.x, bare.right.z], [0, 0, 800, 0]);
});

test('the slab texture fits TMEM: 32 x 64 texels at 16 bits is 4,096 bytes, every channel cut to 5 bits', () => {
  const { TMEM } = X;
  assert.ok(TMEM.w * TMEM.h <= 32 * 64);
  assert.strictEqual(TMEM.w * TMEM.h * TMEM.bits / 8, 4096);
  const t = X.slabTexels();
  assert.strictEqual(t.length, TMEM.w * TMEM.h * 4);
  const levels = new Set(Array.from({ length: 32 }, (_, i) => Math.round(i * 255 / 31)));
  for (let i = 0; i < t.length; i++) if (i % 4 !== 3) assert.ok(levels.has(t[i]), `texel byte ${i} = ${t[i]} is a 5-bit level`);
});

/** A stand-in for the layer's parts: the meshes applyOwn swaps, made the way src/field3d.js makes them. */
function layerParts() {
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(800, 14, 600), mat(0x203048));
  const ballMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), ballMat);
  const bats = {};
  for (const side of ['left', 'right']) {
    const m = mat(side === 'left' ? 0xff0000 : 0x0000ff);
    bats[side] = { blade: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m),
                   handle: new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 26, 10), mat(0x6a4a2a)), mat: m };
  }
  return { slab, ball, ballMat, bats };
}

test('fieldSetup adds the three discs once, moves them, and puts the N64 look on only for its own frames', () => {
  assert.strictEqual(look.fieldSetup(null, stateAt(0, 0)), false, 'no 3D layer (internals() null): nothing happens');
  const scene = new THREE.Scene();
  const parts = layerParts();
  const I = { THREE, renderer: null, scene, camera: new THREE.PerspectiveCamera(), parts };
  const was = { slab: parts.slab.material, ballGeo: parts.ball.geometry, blade: parts.bats.left.blade.geometry };
  globalThis.PongField3D = F;             // the page's global, so the floor comes from the layer's SIZES
  try {
    assert.strictEqual(look.fieldSetup(I, stateAt(0, 510)), true);
    const mine = () => scene.children.filter((c) => c.userData.era === 6);
    assert.strictEqual(mine().length, 3, 'three discs, tagged era 6');
    const left = scene.getObjectByName('era6-blob-left');
    assert.deepStrictEqual([left.position.x, left.position.y, left.position.z], [-430, -110, -255]);
    assert.ok(left.renderOrder < 0 && left.material.opacity === 0.35 && left.material.depthWrite === false);

    look.fieldSetup(I, stateAt(300, 100, { x: 593, y: 93 }));
    assert.strictEqual(mine().length, 3, 'a second frame adds nothing');
    assert.strictEqual(left.position.z, 45, 'the left disc followed its paddle');
    const ball = scene.getObjectByName('era6-blob-ball');
    assert.deepStrictEqual([ball.position.x, ball.position.z], [200, -200], 'the ball\'s disc followed the ball');

    // the renderer calls the scene's hook after the layer posed and relit: the look goes on
    scene.onBeforeRender();
    assert.ok(mine().every((c) => c.visible), 'the discs show on the era\'s own frame');
    const slabMat = parts.slab.material;
    assert.notStrictEqual(slabMat, was.slab);
    assert.ok(slabMat.isMeshLambertMaterial && slabMat.map, 'the slab wears the N64 texture');
    assert.deepStrictEqual([slabMat.map.image.width, slabMat.map.image.height], [32, 64]);
    assert.strictEqual(slabMat.map.magFilter, THREE.LinearFilter, 'filtered, not blocky');
    assert.ok(!slabMat.onBeforeCompile || slabMat.onBeforeCompile === THREE.Material.prototype.onBeforeCompile,
      'no shader chunk (era 5\'s affine warp) on the era\'s own slab: perspective-correct');
    assert.notStrictEqual(parts.ball.geometry, was.ballGeo, 'a smooth low-poly ball');
    assert.ok(parts.ball.material.transparent && parts.ball.material.fog === false, 'the ball stays in the last pass, unfogged');
    assert.strictEqual(parts.ball.material.color.getHex(), 0xffffff, 'the ball keeps the layer\'s colour');
    assert.ok(parts.bats.left.blade.geometry.type === 'CapsuleGeometry', 'round-capped blades');
    assert.strictEqual(parts.bats.left.blade.material.color.getHex(), 0xff0000, 'each blade keeps its ink');

    // another era's frame: the discs hide and the layer's own parts come back
    X.fieldDone();
    scene.onBeforeRender();
    assert.ok(mine().every((c) => !c.visible), 'no discs on another era\'s frame');
    assert.strictEqual(parts.slab.material, was.slab);
    assert.strictEqual(parts.ball.geometry, was.ballGeo);
    assert.strictEqual(parts.bats.left.blade.geometry, was.blade);
  } finally {
    delete globalThis.PongField3D;
  }
});

test('a blade\'s caps are half the paddle\'s width long once the layer scales it, with unit normals', () => {
  const g = X.capsuleBlade(THREE, 12, 90);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  // The layer scales this box by (the paddle's width, the bat's thickness, the paddle's length), so it
  // must be the unit box across the blade and along it. Through its thickness it is the 14-sided section
  // three.js lathes -- a polygon INSIDE that circle, reaching 0.5 cos(pi/14) -- which is the N64's own
  // low-poly round, not a mis-sized box.
  const flat = 0.5 * Math.cos(Math.PI / 14);
  for (const [v, want] of [['x', 0.5], ['y', flat], ['z', 0.5]]) {
    assert.ok(Math.abs(bb.max[v] - want) < 1e-6 && Math.abs(bb.min[v] + want) < 1e-6,
      `along ${v} the box spans ${bb.min[v]} to ${bb.max[v]}, wanted +/-${want}`);
  }
  const pos = g.attributes.position, nor = g.attributes.normal;
  let capStart = 0;
  for (let i = 0; i < pos.count; i++) {
    const l = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i));
    assert.ok(Math.abs(l - 1) < 1e-6, 'unit normal');
    if (Math.abs(nor.getZ(i)) < 1e-6) capStart = Math.max(capStart, Math.abs(pos.getZ(i)));   // the body's side normals
  }
  assert.ok(Math.abs((0.5 - capStart) * 90 - 6) < 1e-6, `cap ${((0.5 - capStart) * 90).toFixed(2)} units, half the width is 6`);
});

test('the canvas fallback is untouched: with no WebGL the era never reaches the scene', () => {
  assert.strictEqual(F.available(), false);
  assert.strictEqual(F.internals(), null);
});
